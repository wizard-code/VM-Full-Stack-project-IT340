<?php
header('Content-Type: application/json');
include('db.php');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input       = json_decode(file_get_contents('php://input'), true) ?? [];
$rawToken    = trim($input['token'] ?? '');
$newPassword = $input['password'] ?? '';

if ($rawToken === '' || strlen($newPassword) < 8) {
    http_response_code(400);
    echo json_encode(['error' => 'Valid token and a password of at least 8 characters are required']);
    exit;
}

$tokenHash = hash('sha256', $rawToken);

$stmt = $conn->prepare("
    SELECT id, user_id
    FROM password_resets
    WHERE token_hash = ? AND expires_at > NOW()
    LIMIT 1
");
$stmt->bind_param("s", $tokenHash);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$row) {
    http_response_code(400);
    echo json_encode(['error' => 'Reset link is invalid or has expired']);
    exit;
}

$newHash = password_hash($newPassword, PASSWORD_BCRYPT);

$conn->begin_transaction();
try {
    $stmt = $conn->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
    $stmt->bind_param("si", $newHash, $row['user_id']);
    $stmt->execute();
    $stmt->close();

    // Invalidate the token immediately after use
    $stmt = $conn->prepare("DELETE FROM password_resets WHERE user_id = ?");
    $stmt->bind_param("i", $row['user_id']);
    $stmt->execute();
    $stmt->close();

    $conn->commit();
    echo json_encode(['ok' => true, 'message' => 'Password updated! You can now log in.']);
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Failed to update password']);
}
?>