const createPNGSprite = (el, folderPath, frameCount, fps = 10) => {
  let frame = 0;
  const img = document.createElement('a-image');
  el.appendChild(img);

  setInterval(() => {
    img.setAttribute('src', `${folderPath}/frame_${String(frame).padStart(3, '0')}.png`);
    frame = (frame + 1) % frameCount;
  }, 1000 / fps);
};

document.addEventListener("DOMContentLoaded", () => {
  const sceneEl = document.querySelector('a-scene');

  sceneEl.addEventListener("arReady", () => {
    const anim = document.querySelector('#anim-target0');
    anim.setAttribute('visible', true);
    createPNGSprite(anim, './animations/target0', 10, 8);
  });
});
