const form = document.querySelector("#login-form");
const errorMessage = document.querySelector("#login-error");
const submitButton = document.querySelector("#login-submit");
const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector(".password-toggle");

passwordToggle.addEventListener("click", () => {
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  passwordToggle.setAttribute("aria-label", showing ? "نمایش رمز عبور" : "پنهان‌کردن رمز عبور");
  passwordToggle.title = showing ? "نمایش رمز عبور" : "پنهان‌کردن رمز عبور";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorMessage.textContent = "";
  submitButton.disabled = true;
  submitButton.firstChild.textContent = "در حال بررسی… ";
  const values = new FormData(form);
  try {
    const response = await fetch("/api/site/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: values.get("username"), password: values.get("password") }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "ورود انجام نشد. دوباره تلاش کنید.");
    window.location.replace("/");
  } catch (error) {
    errorMessage.textContent = error.message || "ارتباط با سرور برقرار نشد.";
    submitButton.disabled = false;
    submitButton.firstChild.textContent = "ورود به سامانه ";
  }
});

fetch("/api/site/session", { cache: "no-store" })
  .then((response) => response.json())
  .then((session) => { if (session.authenticated) window.location.replace("/"); })
  .catch(() => {});
