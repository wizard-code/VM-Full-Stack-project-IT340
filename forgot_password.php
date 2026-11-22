<?php
header('Content-Type: application/json');
include('db.php');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$email = trim($input['email'] ?? '');

if ($email === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Email is required']);
    exit;
}

$stmt = $conn->prepare("SELECT id, username FROM users WHERE email = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

// Always return a generic message so attackers can't enumerate valid emails
if (!$user) {
    echo json_encode(['ok' => true, 'message' => 'If that email exists, a reset link has been generated.']);
    exit;
}

// Delete any old tokens for this user
$stmt = $conn->prepare("DELETE FROM password_resets WHERE user_id = ?");
$stmt->bind_param("i", $user['id']);
$stmt->execute();
$stmt->close();

// Generate a cryptographically secure token and store only its SHA-256 hash
$rawToken  = bin2hex(random_bytes(32));
$tokenHash = hash('sha256', $rawToken);
$expiresAt = date('Y-m-d H:i:s', time() + 900); // 15 minutes

$stmt = $conn->prepare("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)");
$stmt->bind_param("iss", $user['id'], $tokenHash, $expiresAt);
$stmt->execute();
$stmt->close();

$resetLink = "passwordReset.html?token=" . urlencode($rawToken);

echo json_encode([
    'ok'         => true,
    'message'    => 'Reset link generated (valid for 15 minutes).',
    'reset_link' => $resetLink // Shown for local VM testing; email this in production
]);
?>