<?php
    Session_start();
    include('db.php');
     if ($_SERVER["REQUEST_METHOD"] == "POST") {
        $check = "SELECT * FROM Users WHERE email = ?, username = ?, password = ?";
        $stmt = $conn->prepare($check);
        $stmt->bind_param("sss", $Email, $Uname, $hash);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows > 0) {
           header("Location: dashboard.php");
        }
        else{
            echo "<script>alert('Invalid account. Please make sure you have entered the correct details!');
            window.location.href = 'login.html';</script>";
        }
        $stmt->close();
        exit;
     }
?>