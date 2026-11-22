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

function logAudit($conn, $userId, $username, $actionName, $details, $ip) {
    $stmt = $conn->prepare("INSERT INTO audit_log (user_id, username, action, details, ip) VALUES (?, ?, ?, ?, ?)");
    $json = json_encode($details);
    $stmt->bind_param("issss", $userId, $username, $actionName, $json, $ip);
    $stmt->execute();
    $stmt->close();
}

// ---------- GET: Load dashboard data ----------
// ---------- GET: Load dashboard data ----------
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'data') {
    $range = ($_GET['range'] ?? 'week') === 'month' ? 30 : 7;

    // 1. Locations
    $locations = [];
    $res = $conn->query("SELECT id, name FROM locations ORDER BY name ASC");
    while ($row = $res->fetch_assoc()) {
        $locations[] = $row;
    }

    // Determine which location IDs to query
    $selectedIds = [];
    if ($role === 'manager') {
        if (!empty($_GET['location_ids'])) {
            $parts = explode(',', $_GET['location_ids']);
            foreach ($parts as $p) {
                $id = (int)trim($p);
                if ($id > 0) $selectedIds[] = $id;
            }
            $selectedIds = array_values(array_unique($selectedIds));
        }
        if (empty($selectedIds) && count($locations) > 0) {
            $selectedIds = [(int)$locations[0]['id']];
        }
    } else {
        // Employees are strictly locked to their assigned location
        if ($userLocationId) {
            $selectedIds = [$userLocationId];
        }
        $locations = array_values(array_filter($locations, fn($l) => (int)$l['id'] === $userLocationId));
    }

    $items = [];
    $sales = [];
    $costs = [];
    $pending = [];

    if (!empty($selectedIds)) {
        // Safe because every element is cast to (int)
        $inList = implode(',', $selectedIds);

        // 2. Inventory items
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

        // 3. Sales time-series
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

        // 4. Cost time-series
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

        // 5. Pending approval queue
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

    // 6. User list (managers only)
    $users = [];
    if ($role === 'manager') {
        $res = $conn->query("SELECT id, username, email, role, location_id FROM users ORDER BY username ASC");
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

        $stmt = $conn->prepare("INSERT INTO locations (name) VALUES (?)");
        $stmt->bind_param("s", $name);
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

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("DELETE FROM changes WHERE requested_by = ?");
            $stmt->bind_param("i", $targetId);
            $stmt->execute();
            $stmt->close();

            $stmt = $conn->prepare("DELETE FROM users WHERE id = ? AND role = 'employee'");
            $stmt->bind_param("i", $targetId);
            $stmt->execute();
            $deleted = $stmt->affected_rows;
            $stmt->close();

            if ($deleted === 0) {
                throw new Exception('Only employee accounts can be removed (demote manager first if needed)');
            }

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