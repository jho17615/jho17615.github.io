// Sidebar open
function w3_open() {
  document.getElementById("mySidebar").style.display = "block";
  document.getElementById("myOverlay").style.display = "block";
}

// Sidebar close
function w3_close() {
  document.getElementById("mySidebar").style.display = "none";
  document.getElementById("myOverlay").style.display = "none";
}
document.addEventListener("DOMContentLoaded", () => {
  const gt = document.querySelector(".go-to");

  if (gt) {
    gt.addEventListener("click", () => {
      window.open(
        "https://github.com/jho17615/-AI-vision-safety-detection",
        "_blank"
      );
    });
  }
});
document.addEventListener("DOMContentLoaded", () => {
  const todoElements = document.querySelectorAll(".go-to-todo");

  todoElements.forEach((el) => {
    el.addEventListener("click", () => {
      open("TodoList/index.html", "_blank");
    });
  });
});
