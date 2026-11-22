<?php
session_start();
include('db.php');

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $Uname = htmlspecialchars($_POST["Uname"] ?? "");
    $Email = htmlspecialchars($_POST["Email"] ?? $_POST["email"] ?? "");
    $Password = $_POST["Password"] ?? $_POST["password"] ?? $_POST["pwd"] ?? "";

    // Validate password strength
    if (
        strlen($Password) < 8 ||
        strlen($Password) > 15 ||
        !preg_match('/[A-Z]/', $Password) ||
        !preg_match('/[a-z]/', $Password) ||
        !preg_match('/[0-9]/', $Password) ||
        !preg_match('/[^a-zA-Z0-9]/', $Password)
    ) {
        echo "<script>alert('Password must be 8-15 characters and include uppercase, lowercase, a number, and a symbol.');
        window.location.href = 'Signup.html';</script>";
        exit;
    }

    // Check if email or username already exists
    $check = "SELECT * FROM users WHERE email = ? OR username = ?";
    $stmt = $conn->prepare($check);
    $stmt->bind_param("ss", $Email, $Uname);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows > 0) {
        $stmt->close();
        echo "<script>alert('User already exists!');
        window.location.href = 'Signup.html';</script>";
        exit;
    }
    $stmt->close();

    // Hash password and insert new user
    $hash = password_hash($Password, PASSWORD_BCRYPT);
    $sql = "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)";    $stmt = $conn->prepare($sql);
    $stmt->bind_param("sss", $Uname, $Email, $hash);

    if ($stmt->execute()) {
        $stmt->close();
        $_SESSION['user_id']  = $conn->insert_id;  
        $_SESSION['username'] = $Uname;             
        $_SESSION['role']     = 'employee';         
        header("Location: dashboard.html");
        exit;
    }
    $stmt->close();
}
?>