document.addEventListener("DOMContentLoaded", () => {
  const sceneEl = document.querySelector("a-scene");

  sceneEl.addEventListener("arReady", () => {
    console.log("✅ MindAR prêt");
  });

  sceneEl.addEventListener("renderstart", () => {
    console.log("▶️ A-Frame rendu démarré");
  });

  sceneEl.addEventListener("targetFound", () => {
    console.log("🎯 Cible détectée !");
    const anim = document.querySelector("#anim-target0");
    anim.setAttribute("visible", true);
  });

  sceneEl.addEventListener("targetLost", () => {
    console.log("❌ Cible perdue !");
    const anim = document.querySelector("#anim-target0");
    anim.setAttribute("visible", false);
  });
});
