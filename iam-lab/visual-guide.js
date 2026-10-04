(function () {
  "use strict";

  const visuals = window.IamVisuals;
  const order = ["overview", "user", "group", "policy", "readOnly", "request", "deny", "assume", "sts", "ec2", "matrix", "rbac", "reader", "combine", "shared", "transfer", "offboard", "limits", "analyzer", "safety", "cleanup"];
  const select = document.getElementById("picture-topic");
  order.forEach(function (key) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = visuals.topics[key].title;
    select.appendChild(option);
  });

  function render() {
    const requested = window.location.hash.slice(1);
    const key = order.includes(requested) ? requested : "overview";
    select.value = key;
    const index = order.indexOf(key);
    document.getElementById("visual-guide-art").innerHTML = key === "overview" ? visuals.art() : "";
    document.getElementById("picture-content").innerHTML = visuals.card(key);
    document.getElementById("picture-count").textContent = (index + 1) + " / " + order.length;
    document.getElementById("previous-picture").disabled = index === 0;
    document.getElementById("next-picture").disabled = index === order.length - 1;
  }

  select.addEventListener("change", function () { window.location.hash = select.value; });
  document.getElementById("previous-picture").addEventListener("click", function () {
    const index = order.indexOf(select.value);
    if (index > 0) window.location.hash = order[index - 1];
  });
  document.getElementById("next-picture").addEventListener("click", function () {
    const index = order.indexOf(select.value);
    if (index < order.length - 1) window.location.hash = order[index + 1];
  });
  window.addEventListener("hashchange", render);
  render();
})();
