<?php
    Session_start();
    include('db.php');
     if ($_SERVER["REQUEST_METHOD"] == "POST") {
        $check = "SELECT * FROM users WHERE email = ?, username = ?, password_hash = ?";
        $stmt = $conn->prepare($check);
        $stmt->bind_param("sss", $Email, $Uname, $hash);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows > 0) {
            $row = $result->fetch_assoc();
            $_SESSION['user_id']  = $row['id'];       
            $_SESSION['username'] = $row['username']; 
            $_SESSION['role'] = $row['role']; 
            header("Location: dashboard.html");
        }
        else{
            echo "<script>alert('Invalid account. Please make sure you have entered the correct details!');
            window.location.href = 'Loginpage.html';</script>";
        }
        $stmt->close();
        exit;
     }
?>