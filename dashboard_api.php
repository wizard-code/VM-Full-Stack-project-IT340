<?php
session_start();
header('Content-Type: application/json');
include('db.php');

// Require an active session
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

$userId   = (int)$_SESSION['user_id'];
$username = $_SESSION['username'] ?? 'User';
$role     = $_SESSION['role'] ?? 'employee';
$ip       = $_SERVER['REMOTE_ADDR'] ?? null;
$action   = $_GET['action'] ?? '';

$stmt = $conn->prepare("SELECT location_id FROM users WHERE id = ?");
$stmt->bind_param("i", $userId);
$stmt->execute();
$uRow = $stmt->get_result()->fetch_assoc();
$stmt->close();
$userLocationId = $uRow && $uRow['location_id'] !== null ? (int)$uRow['location_id'] : null;

// Determine which locations this user is allowed to access
$allowedLocationIds = [];
if ($role === 'manager') {
    $stmt = $conn->prepare("SELECT id FROM locations WHERE owner_id = ?");
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($r = $res->fetch_assoc()) {
        $allowedLocationIds[] = (int)$r['id'];
    }
    $stmt->close();
} else {
    if ($userLocationId) {
        $allowedLocationIds = [$userLocationId];
    }
}

function logAudit($conn, $userId, $username, $actionName, $details, $ip) {
    $stmt = $conn->prepare("INSERT INTO audit_log (user_id, username, action, details, ip) VALUES (?, ?, ?, ?, ?)");
    $json = json_encode($details);
    $stmt->bind_param("issss", $userId, $username, $actionName, $json, $ip);
    $stmt->execute();
    $stmt->close();
}

// ---------- GET: Load dashboard data ----------
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'data') {
    $range = ($_GET['range'] ?? 'week') === 'month' ? 30 : 7;

    $locations = [];
    if (!empty($allowedLocationIds)) {
        $allowedIn = implode(',', $allowedLocationIds);
        $res = $conn->query("SELECT id, name FROM locations WHERE id IN ($allowedIn) ORDER BY name ASC");
        while ($row = $res->fetch_assoc()) {
            $locations[] = $row;
        }
    }

    // Determine which location IDs to query
    $selectedIds = [];
    if ($role === 'manager') {
        if (!empty($_GET['location_ids'])) {
            foreach (explode(',', $_GET['location_ids']) as $p) {
                $id = (int)trim($p);
                if (in_array($id, $allowedLocationIds, true)) {
                    $selectedIds[] = $id;
                }
            }
            $selectedIds = array_values(array_unique($selectedIds));
        }
        if (empty($selectedIds) && !empty($allowedLocationIds)) {
            $selectedIds = [$allowedLocationIds[0]];
        }
    } else {
        $selectedIds = $allowedLocationIds;
    }

    $items   = [];
    $sales   = [];
    $costs   = [];
    $pending = [];

    if (!empty($selectedIds)) {
        $inList = implode(',', $selectedIds);

        // Inventory items
        $res = $conn->query("
            SELECT i.id, i.location_id, l.name AS location_name, i.name, i.type, i.unit, i.quantity, i.low_threshold, i.cost_per_unit, i.price
            FROM items i
            JOIN locations l ON i.location_id = l.id
            WHERE i.location_id IN ($inList) AND i.archived = 0
            ORDER BY l.name, i.type, i.name
        ");
        while ($row = $res->fetch_assoc()) {
            $items[] = $row;
        }

        // Sales time-series
        $stmt = $conn->prepare("
            SELECT DATE(sold_at) AS day, SUM(total) AS total
            FROM sales
            WHERE location_id IN ($inList) AND sold_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(sold_at)
            ORDER BY day ASC
        ");
        $stmt->bind_param("i", $range);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $sales[] = $row;
        }
        $stmt->close();

        // Cost time-series
        $stmt = $conn->prepare("
            SELECT DATE(incurred_at) AS day, SUM(amount) AS total
            FROM costs
            WHERE location_id IN ($inList) AND incurred_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(incurred_at)
            ORDER BY day ASC
        ");
        $stmt->bind_param("i", $range);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $costs[] = $row;
        }
        $stmt->close();

        // Pending approval queue
        $res = $conn->query("
            SELECT c.*, u.username AS requested_by_name, l.name AS location_name
            FROM changes c
            JOIN users u ON c.requested_by = u.id
            JOIN locations l ON c.location_id = l.id
            WHERE c.location_id IN ($inList) AND c.status = 'pending'
            ORDER BY c.created_at DESC
        ");
        while ($row = $res->fetch_assoc()) {
            $pending[] = $row;
        }
    }

    $users = [];
    if ($role === 'manager') {
        if (!empty($allowedLocationIds)) {
            $allowedIn = implode(',', $allowedLocationIds);
            $res = $conn->query("
                SELECT id, username, email, role, location_id
                FROM users
                WHERE id = $userId
                   OR location_id IN ($allowedIn)
                   OR (role = 'employee' AND location_id IS NULL)
                ORDER BY username ASC
            ");
        } else {
            $res = $conn->query("
                SELECT id, username, email, role, location_id
                FROM users
                WHERE id = $userId OR (role = 'employee' AND location_id IS NULL)
                ORDER BY username ASC
            ");
        }
        while ($row = $res->fetch_assoc()) {
            $users[] = $row;
        }
    }

    echo json_encode([
        'user'         => ['id' => $userId, 'username' => $username, 'role' => $role, 'location_id' => $userLocationId],
        'location_ids' => $selectedIds,
        'locations'    => $locations,
        'items'        => $items,
        'sales'        => $sales,
        'costs'        => $costs,
        'pending'      => $pending,
        'users'        => $users
    ]);
    exit;
}

// ---------- POST actions ----------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];

    // 1. Employee/Manager: Submit a change request
    if ($action === 'request_change') {
        $locationId = isset($input['location_id']) ? (int)$input['location_id'] : ($allowedLocationIds[0] ?? 0);
        $changeType = trim($input['change_type'] ?? '');
        $payload    = $input['payload'] ?? [];

        if (!in_array($locationId, $allowedLocationIds, true)) {
            http_response_code(403);
            echo json_encode(['error' => 'You do not have access to this location']);
            exit;
        }
        if ($changeType === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Change type is required']);
            exit;
        }

        $payloadJson = json_encode($payload);
        $stmt = $conn->prepare("
            INSERT INTO changes (location_id, requested_by, change_type, payload, status)
            VALUES (?, ?, ?, ?, 'pending')
        ");
        $stmt->bind_param("iiss", $locationId, $userId, $changeType, $payloadJson);
        $stmt->execute();
        $changeId = $conn->insert_id;
        $stmt->close();

        logAudit($conn, $userId, $username, 'change.request', ['id' => $changeId, 'location_id' => $locationId, 'type' => $changeType], $ip);
        echo json_encode(['ok' => true, 'id' => $changeId]);
        exit;
    }

    // 2. Manager: Update low-stock threshold for an item
    if ($action === 'update_threshold') {
        if ($role !== 'manager') {
            http_response_code(403);
            echo json_encode(['error' => 'Managers only']);
            exit;
        }
        $itemId    = (int)($input['item_id'] ?? 0);
        $threshold = (float)($input['low_threshold'] ?? 0);

        $stmt = $conn->prepare("
            UPDATE items i
            JOIN locations l ON i.location_id = l.id
            SET i.low_threshold = ?
            WHERE i.id = ? AND l.owner_id = ?
        ");
        $stmt->bind_param("dii", $threshold, $itemId, $userId);
        $stmt->execute();
        $updated = $stmt->affected_rows;
        $stmt->close();

        if ($updated === 0) {
            http_response_code(403);
            echo json_encode(['error' => 'Item not found in your locations']);
            exit;
        }

        logAudit($conn, $userId, $username, 'item.threshold', ['item_id' => $itemId, 'low_threshold' => $threshold], $ip);
        echo json_encode(['ok' => true]);
        exit;
    }

    // 3. Manager: Approve or reject a pending change
    if ($action === 'decide_change') {
        if ($role !== 'manager') {
            http_response_code(403);
            echo json_encode(['error' => 'Managers only']);
            exit;
        }
        $changeId = (int)($input['change_id'] ?? 0);
        $decision = ($input['decision'] ?? '') === 'approved' ? 'approved' : 'rejected';

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("
                SELECT c.*
                FROM changes c
                JOIN locations l ON c.location_id = l.id
                WHERE c.id = ? AND c.status = 'pending' AND l.owner_id = ?
                FOR UPDATE
            ");
            $stmt->bind_param("ii", $changeId, $userId);
            $stmt->execute();
            $change = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if (!$change) {
                throw new Exception('Pending change not found in your locations');
            }

            if ($decision === 'approved') {
                $payload = json_decode($change['payload'] ?? '{}', true) ?? [];
                $locId   = (int)$change['location_id'];
                $type    = $change['change_type'] ?? '';

                if ($type === 'add_item') {
                    $stmt = $conn->prepare("
                        INSERT INTO items (location_id, name, type, unit, quantity, low_threshold, cost_per_unit, price)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ");
                    $name  = $payload['name'] ?? 'Item';
                    $itype = $payload['type'] ?? 'ingredient';
                    $unit  = $payload['unit'] ?? 'unit';
                    $qty   = (float)($payload['quantity'] ?? 0);
                    $low   = (float)($payload['low_threshold'] ?? 5);
                    $cost  = (float)($payload['cost_per_unit'] ?? 0);
                    $price = (float)($payload['price'] ?? 0);
                    $stmt->bind_param("isssdddd", $locId, $name, $itype, $unit, $qty, $low, $cost, $price);
                    $stmt->execute();
                    $stmt->close();
                } elseif ($type === 'adjust_stock') {
                    $itemId = (int)($payload['item_id'] ?? 0);
                    $delta  = (float)($payload['delta'] ?? 0);
                    $stmt = $conn->prepare("UPDATE items SET quantity = GREATEST(0, quantity + ?) WHERE id = ? AND location_id = ?");
                    $stmt->bind_param("dii", $delta, $itemId, $locId);
                    $stmt->execute();
                    $stmt->close();
                } elseif ($type === 'record_sale') {
                    $total = (float)($payload['total'] ?? 0);
                    $stmt = $conn->prepare("INSERT INTO sales (location_id, total, sold_at) VALUES (?, ?, NOW())");
                    $stmt->bind_param("id", $locId, $total);
                    $stmt->execute();
                    $stmt->close();
                } elseif ($type === 'record_cost') {
                    $amount = (float)($payload['amount'] ?? 0);
                    $stmt = $conn->prepare("INSERT INTO costs (location_id, amount, incurred_at) VALUES (?, ?, NOW())");
                    $stmt->bind_param("id", $locId, $amount);
                    $stmt->execute();
                    $stmt->close();
                } elseif ($type === 'archive_item') {
                    $itemId = (int)($payload['item_id'] ?? 0);
                    $stmt = $conn->prepare("UPDATE items SET archived = 1 WHERE id = ? AND location_id = ?");
                    $stmt->bind_param("ii", $itemId, $locId);
                    $stmt->execute();
                    $stmt->close();
                }
            }

            $stmt = $conn->prepare("UPDATE changes SET status = ? WHERE id = ?");
            $stmt->bind_param("si", $decision, $changeId);
            $stmt->execute();
            $stmt->close();

            logAudit($conn, $userId, $username, 'change.' . $decision, ['change_id' => $changeId], $ip);
            $conn->commit();
            echo json_encode(['ok' => true]);
        } catch (Exception $e) {
            $conn->rollback();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
        exit;
    }

    // 4. Manager: Add a new bakery location
    if ($action === 'add_location') {
        if ($role !== 'manager') {
            http_response_code(403);
            echo json_encode(['error' => 'Managers only']);
            exit;
        }
        $name = trim($input['name'] ?? '');
        if ($name === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Location name is required']);
            exit;
        }

        $stmt = $conn->prepare("INSERT INTO locations (name, owner_id) VALUES (?, ?)");
        $stmt->bind_param("si", $name, $userId);
        try {
            $stmt->execute();
        } catch (mysqli_sql_exception $e) {
            http_response_code(400);
            echo json_encode(['error' => 'Location already exists']);
            exit;
        }
        $newLocId = $conn->insert_id;
        $stmt->close();

        logAudit($conn, $userId, $username, 'location.create', ['id' => $newLocId, 'name' => $name], $ip);
        echo json_encode(['ok' => true, 'id' => $newLocId]);
        exit;
    }

    // 5. Manager: Change a user's role (manager/employee) and location
    if ($action === 'update_user') {
        if ($role !== 'manager') {
            http_response_code(403);
            echo json_encode(['error' => 'Managers only']);
            exit;
        }
        $targetId = (int)($input['user_id'] ?? 0);
        $newRole  = ($input['role'] ?? '') === 'manager' ? 'manager' : 'employee';
        $newLocId = isset($input['location_id']) && $input['location_id'] !== '' ? (int)$input['location_id'] : null;

        if ($targetId === $userId && $newRole !== 'manager') {
            http_response_code(400);
            echo json_encode(['error' => 'You cannot remove your own manager role']);
            exit;
        }

        // Prevent assigning someone to a location this manager doesn't own
        if ($newLocId !== null && !in_array($newLocId, $allowedLocationIds, true)) {
            http_response_code(403);
            echo json_encode(['error' => 'Cannot assign user to a location you do not own']);
            exit;
        }

        // Prevent editing another company's user
        $allowedIn = !empty($allowedLocationIds) ? implode(',', $allowedLocationIds) : '0';
        $check = $conn->prepare("
            SELECT id FROM users
            WHERE id = ?
              AND (id = ? OR location_id IN ($allowedIn) OR (role = 'employee' AND location_id IS NULL))
        ");
        $check->bind_param("ii", $targetId, $userId);
        $check->execute();
        if (!$check->get_result()->fetch_assoc()) {
            $check->close();
            http_response_code(403);
            echo json_encode(['error' => 'You do not have permission to modify this user']);
            exit;
        }
        $check->close();

        $stmt = $conn->prepare("UPDATE users SET role = ?, location_id = ? WHERE id = ?");
        $stmt->bind_param("sii", $newRole, $newLocId, $targetId);
        $stmt->execute();
        $stmt->close();

        logAudit($conn, $userId, $username, 'user.update', ['target_id' => $targetId, 'role' => $newRole, 'location_id' => $newLocId], $ip);
        echo json_encode(['ok' => true]);
        exit;
    }

    // 6. Manager: Remove an employee
    if ($action === 'delete_user') {
        if ($role !== 'manager') {
            http_response_code(403);
            echo json_encode(['error' => 'Managers only']);
            exit;
        }
        $targetId = (int)($input['user_id'] ?? 0);
        if ($targetId === $userId) {
            http_response_code(400);
            echo json_encode(['error' => 'You cannot delete your own account']);
            exit;
        }

        $allowedIn = !empty($allowedLocationIds) ? implode(',', $allowedLocationIds) : '0';

        $conn->begin_transaction();
        try {
            $check = $conn->prepare("
                SELECT id FROM users
                WHERE id = ? AND role = 'employee'
                  AND (location_id IN ($allowedIn) OR location_id IS NULL)
            ");
            $check->bind_param("i", $targetId);
            $check->execute();
            if (!$check->get_result()->fetch_assoc()) {
                $check->close();
                throw new Exception('Employee not found in your locations (or demote manager first)');
            }
            $check->close();

            $stmt = $conn->prepare("DELETE FROM changes WHERE requested_by = ?");
            $stmt->bind_param("i", $targetId);
            $stmt->execute();
            $stmt->close();

            $stmt = $conn->prepare("DELETE FROM users WHERE id = ? AND role = 'employee'");
            $stmt->bind_param("i", $targetId);
            $stmt->execute();
            $stmt->close();

            logAudit($conn, $userId, $username, 'user.delete', ['target_id' => $targetId], $ip);
            $conn->commit();
            echo json_encode(['ok' => true]);
        } catch (Exception $e) {
            $conn->rollback();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
        exit;
    }
}

http_response_code(400);
echo json_encode(['error' => 'Invalid request']);
?>