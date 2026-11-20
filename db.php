<?php
// Database connection parameters
$servername = "10.10.10.3";
$username = "backend_user"; 
$password = "Killcode_41=sql";
$dbname = "bakeboard";
// Create connection
$conn = new mysqli($servername, $username, $password, $dbname);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
?>