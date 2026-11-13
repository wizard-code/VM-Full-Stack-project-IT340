function eye() {
    const pw = document.getElementById("pwd");
    const icon = document.getElementById("eye");

    if (pw.type === "password") {
        pw.type = "text";
        icon.src = "media/eye_open.png";
        icon.alt = "Hide password";
    } else {
        pw.type = "password";
        icon.src = "media/eye_closed.png";
        icon.alt = "Show password";
    }
}
document.getElementById("eye").addEventListener("click", eye);

const emailRe = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

document.getElementById("forgot").addEventListener("click", function (e) {
    const x = document.getElementById("UnameOrEmail");
    const val = x.value.trim();

    if (val === "") {
        e.preventDefault();
        alert("Enter your email to reset your password");
        x.focus();
        return;
    }
    if (!emailRe.test(val)) {
        e.preventDefault();
        alert("Must have a valid email to reset password, e.g. name@site.com");
        x.focus();
    }
});