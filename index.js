function eye() { // open and close the eye icon to show or hide password
    const pw = document.getElementById("pwd");
    const icon = document.getElementById("eye");

    if (pw.type === "password") {
        pw.type = "text";
        icon.src = "media/eye_open.png";
        icon.alt = "eye-open";
    } else {
        pw.type = "password";
        icon.src = "media/eye_closed.png";
        icon.alt = "eye-close";
    }
}

document.getElementById("eye").addEventListener("click", eye);

function validate() { // validate username or email
    const x = document.getElementById("UnameOrEmail");
    const val = x.value.trim();

    const emailRe = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
    const unameRe = /^(?=.*[A-Za-z])(?=.*\d)(?=.*\W)\S+$/;

    if (val === "") {
        alert("You must enter a Username or Email to Sign in");
        x.focus();
        return false;
    }
    if (val.includes("@")) {
        if (!emailRe.test(val)) {
            alert("Email must have a valid domain, e.g. name@site.com");
            x.focus();
            return false;
        }
    } else if (!unameRe.test(val)) {
        alert("Username must have letters, numbers, and a special character");
        x.focus();
        return false;
    }
    return true;
}

function pass() { // validate password
    const x = document.getElementById("pwd");
    const val = x.value.trim();
    const pwdRe = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*\W)\S{8,15}$/;

    if (val.length < 8 || val.length > 15) {
        alert("Password length should be 8-15 characters long");
        x.focus();
        return false;
    }
    if (!pwdRe.test(val)) {
        alert("Password must have an uppercase letter, a lowercase letter, a number, and a special character");
        x.focus();
        return false;
    }
    return true;
}
function cpass() { // validate confirm password
    const x = document.getElementById("pwd");
    const y = document.getElementById("Cpwd");
    if (x.value !== y.value) {
        alert("Passwords do not match");
        y.focus();
        return false;
    }
    return true;
}

function check() { // validate both username/email and password and prevent form submission if either is invalid
    return validate() && pass() && cpass();
}
function mustEmail(e) {
    const x = document.getElementById("UnameOrEmail");
    const val = x.value.trim();
    const emailRe = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

    if (!emailRe.test(val)) {
        e.preventDefault();
        alert("Must have a valid email to reset password");
        x.focus();
        return false;
    }
    return true;
}

document.getElementById("forgot").addEventListener("click", mustEmail);
