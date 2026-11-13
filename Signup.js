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

function checkUname() {
    const x = document.getElementById("Uname");
    const val = x.value.trim();
    const unameRe = /^[a-zA-Z0-9_]{3,20}$/;

    if (val === "") {
        alert("You must enter a Username");
        x.focus();
        return false;
    }
    if (!unameRe.test(val)) {
        alert("Username must be 3-20 characters long and can contain letters, numbers, and underscores");
        x.focus();
        return false;
    }
    return true;
}

function checkEmail() {
    const x = document.getElementById("email");
    const val = x.value.trim();
    const emailRe = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

    if (val === "") {
        alert("You must enter an Email");
        x.focus();
        return false;
    }
    if (!emailRe.test(val)) {
        alert("Email must have a valid domain, e.g. name@site.com");
        x.focus();
        return false;
    }
    return true;
}

function pass() {
    const x = document.getElementById("pwd");
    const val = x.value; // no trim, \S in the regex rejects spaces
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

function confirmPass() {
    const pw = document.getElementById("pwd");
    const x = document.getElementById("Cpwd");

    if (x.value === "") {
        alert("You must confirm your password");
        x.focus();
        return false;
    }
    if (x.value !== pw.value) {
        alert("Passwords do not match");
        x.focus();
        return false;
    }
    return true;
}
document.getElementById("signupForm").addEventListener("submit", function (e) {
    if (!(checkUname() && checkEmail() && pass() && confirmPass())) {
        e.preventDefault();
    }
});