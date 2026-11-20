<?php
    Session_start();
    include('db.php');
    $data = $Uname = $Email = $Password = $CPassword = "";
    if ($_SERVER["REQUEST_METHOD"] == "POST") {
        $Uname = htmlspecialchars($_POST["Uname"]);
        $Email = htmlspecialchars($_POST["Email"]);
        $Password = $_POST["Password"] ?? "";
if (
    strlen($Password) < 8 ||
    strlen($Password) > 15 ||
    !preg_match('/[A-Z]/', $Password) ||
    !preg_match('/[a-z]/', $Password) ||
    !preg_match('/[0-9]/', $Password) ||
    !preg_match('/[^a-zA-Z0-9]/', $Password)
) 


        $hash = password_hash($Password, PASSWORD_BCRYPT);
        $check = "SELECT * FROM Users WHERE email = ?, username = ?, password = ?";
        $stmt = $conn->prepare($check);
        $stmt->bind_param("sss", $Email, $Uname, $hash);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows > 0) {
           echo "<script>alert('User already exists!');
           window.location.href = 'signup.html';</script>";
        }
        //make a sql query to insert the data into the database
        $sql = "INSERT INTO Users (username, email, password) VALUES (?, ?, ?)";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param("sss", $Uname, $Email, $hash);
       if($stmt->execute()){
        header("Location: dashboard.html");
        $stmt->close();
        exit;
       }
    }
?>