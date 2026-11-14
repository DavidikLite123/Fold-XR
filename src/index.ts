import * as THREE from 'three';
import * as xb from 'xrblocks';
import {SpatialOSManager} from './os/SpatialOSManager';

document.addEventListener('DOMContentLoaded', async () => {
  const options = new xb.Options();
  options.enableHands();
  options.hands.visualization = true;
  options.hands.visualizeJoints = false;
  options.hands.visualizeMeshes = false;

  options.enableGestures();
  options.gestures.setGestureEnabled('point', true);
  options.gestures.setGestureEnabled('spread', true);

  options.enableReticles();
  options.enableHandRays();

  options.setAppTitle('FoldXR OS');
  options.setAppDescription(
    'Пространственная ОС для смартфонов и WebXR: листайте приложения пальцем, уменьшайте или увеличивайте окна, включайте следование за собой, открывайте рабочий браузер и 3D-игры.'
  );
  options.xrButton.startText = 'Войти в AR / XR';
  options.xrButton.startSimulatorText = 'Запустить XR-симулятор';
  options.xrButton.endText = 'Выйти из XR';
  options.xrButton.showEnterSimulatorButton = true;

  if (new URLSearchParams(window.location.search).has('autostart')) {
    options.xrButton.alwaysAutostartSimulator = true;
  }

  xb.add(new SpatialOSManager());
  await xb.init(options);

  // Cap WebGL pixel ratio on high-DPI phones (e.g. Fold 3x DPR) for smooth 60fps.
  const renderer = xb.core.renderer;
  if (renderer instanceof THREE.WebGLRenderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  }
});
