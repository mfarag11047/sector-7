// The player's camera: a view down on the map at a fixed angle (components/cameraView.ts), steeply
// but well off straight down. It pans with WASD or the arrow keys, zooms with the wheel between
// MIN_ZOOM and MAX_ZOOM, and turns with the right mouse button held and dragged left or right,
// round the spot in the middle of the screen. It opens looking along a heading set per side. Its
// angle down can't be changed.

import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { updateGlobalFrustum } from '../frustum';
import { freezeContainer } from '../perf';
import { CAMERA_PITCH, CAMERA_SPEED, CITY_CONFIG, CAMERA_ZOOM_SPEED, MIN_ZOOM, MAX_ZOOM } from '../constants';
import { lookAhead } from './cameraView';
import { listen } from './sfx';

interface DroneCameraProps {
    cameraStateRef?: React.MutableRefObject<{ x: number, y: number, z: number, yaw: number }>;
    // Where the camera starts, in world units (and how high), and the heading it looks along.
    start?: { x: number, z: number, y?: number, yaw: number };
}

// Somewhere for the rest of the game to ask the camera to look: a point on the ground in world
// units. The camera glides so that point sits in the middle of the view, keeping its height and
// angle. Cleared once taken.
export const cameraFocus: { target: { x: number; z: number } | null } = { target: null };

// The right mouse button both turns the camera (held and dragged) and, clicked, clears the
// selection and cancels orders (CityMap.tsx). A right-click that turned the camera mustn't also
// cancel. Browsers send it at different moments: on Windows when the button is let go, after the
// turn; on macOS and Linux as soon as it is pressed, before anyone can tell whether a turn follows.
// So `onRightClick` runs a right-click's action at once if the button is already up (and it wasn't
// a turn), and otherwise holds it until the button is let go, dropping it if the camera turned.
const TURN_SENSITIVITY = 0.005;
const TURN_THRESHOLD_PX = 4;
const turn = { held: false, turning: false, endedAt: 0, pending: null as (() => void) | null };
export function onRightClick(action: () => void): void {
  if (turn.turning || Date.now() - turn.endedAt < 250) return;
  if (turn.held) { turn.pending = action; return; }
  action();
}

const UP = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

const DroneCamera: React.FC<DroneCameraProps> = ({ cameraStateRef, start }) => {
  const { camera, gl, scene, raycaster } = useThree();

  // The scene root never moves. Leaving it auto-updating dirties it every frame,
  // which forces matrix updates through every subtree below it.
  useEffect(() => {
    freezeContainer(scene);
  }, [scene]);

  // Dev-only handle for performance profiling from the console.
  useEffect(() => {
    if ((import.meta as any).env?.DEV) {
      (window as any).__GAME3D = { scene, gl, camera, raycaster, THREE };
    }
  }, [scene, gl, camera, raycaster]);
  
  // Position State
  const positionRef = useRef(new THREE.Vector3(start?.x ?? 0, start?.y ?? 80, start?.z ?? 80));
  
  // The heading it looks along (about Y; 0 = north, -Z): the side's to start with, then the player's.
  const yawRef = useRef(start?.yaw ?? 0);
  // Start in place rather than gliding over from wherever the camera was.
  useEffect(() => { camera.position.copy(positionRef.current); }, [camera]);

  // Input State
  const keys = useRef<{ [key: string]: boolean }>({});
  
  // Map Bounds
  const maxPos = (CITY_CONFIG.gridSize * CITY_CONFIG.tileSize) / 2;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    
    // Right-drag turns the camera round the spot in the middle of the screen: the camera swings
    // round it, keeping its height and angle, so that spot stays put.
    let dragFrom: number | null = null;
    let dragged = 0;
    const handleMouseDown = (e: MouseEvent) => {
        if (e.button !== 2) return;
        dragFrom = e.clientX;
        dragged = 0;
        turn.held = true;
        turn.pending = null;
    };
    const handleMouseMove = (e: MouseEvent) => {
        if (dragFrom === null) return;
        const dx = e.clientX - dragFrom;
        dragFrom = e.clientX;
        dragged += Math.abs(dx);
        if (dragged < TURN_THRESHOLD_PX) return;
        if (!turn.turning) { turn.turning = true; turn.pending = null; gl.domElement.style.cursor = 'grabbing'; }
        const angle = -dx * TURN_SENSITIVITY;
        const p = positionRef.current;
        const ahead = lookAhead(p.y);
        const yaw = yawRef.current;
        // The spot in the middle of the screen, and the camera swung round it.
        const cx = p.x - Math.sin(yaw) * ahead, cz = p.z - Math.cos(yaw) * ahead;
        const swing = (v: THREE.Vector3) => _move.set(v.x - cx, 0, v.z - cz).applyAxisAngle(UP, angle);
        swing(p);
        p.x = Math.max(-maxPos, Math.min(maxPos, cx + _move.x));
        p.z = Math.max(-maxPos, Math.min(maxPos, cz + _move.z));
        swing(camera.position); camera.position.x = cx + _move.x; camera.position.z = cz + _move.z;
        yawRef.current = yaw + angle;
    };
    const handleMouseUp = (e: MouseEvent) => {
        if (e.button !== 2) return;
        dragFrom = null;
        turn.held = false;
        if (turn.turning) { turn.turning = false; turn.endedAt = Date.now(); gl.domElement.style.cursor = ''; }
        // A right-click sent on the press, which didn't turn into a turn: carry it out now.
        const action = turn.pending;
        turn.pending = null;
        action?.();
    };
    // Right-click gives orders and cancels; no browser menu over the map.
    const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    gl.domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    gl.domElement.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      gl.domElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      gl.domElement.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [gl.domElement, camera, maxPos]);

  // The wheel zooms by changing the height, by a share of itself per notch so each notch feels
  // the same near the ground or high up. It zooms on the middle of the screen: the camera slides
  // along its heading so the line of sight stays on the same spot of ground.
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
        const p = positionRef.current;
        const y = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, p.y * Math.exp((e.deltaY / 100) * CAMERA_ZOOM_SPEED)));
        const slide = lookAhead(p.y) - lookAhead(y);
        const yaw = yawRef.current;
        p.x = Math.max(-maxPos, Math.min(maxPos, p.x - Math.sin(yaw) * slide));
        p.z = Math.max(-maxPos, Math.min(maxPos, p.z - Math.cos(yaw) * slide));
        p.y = y;
    };
    
    window.addEventListener('wheel', handleWheel);
    return () => window.removeEventListener('wheel', handleWheel);
  }, [maxPos]);

  // Runs before every other frame callback (priority -1). Buildings and units hide themselves
  // when off-screen using the frustum worked out here; when the camera ran after them they
  // were judging against last frame's view, so the edge of the screen popped in a frame late
  // while panning.
  useFrame((state, rawDelta) => {
    // A long stall (tab in the background) shouldn't fling the camera across the map.
    const delta = Math.min(rawDelta, 0.1);
    // 1. The view: along the heading, CAMERA_PITCH down, no roll.
    const yaw = yawRef.current;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = -CAMERA_PITCH;
    camera.rotation.z = 0;

    // 2. Calculate Movement Vector relative to Yaw. Speed is per second (the old per-frame
    // value at 60 fps), so panning keeps its pace when the frame rate dips.
    const speed = CAMERA_SPEED * 60 * delta * (positionRef.current.y / 20); // Move faster when zoomed out
    
    // "Forward" is -Z in local space. We rotate that by Yaw to get World Forward.
    const forward = _forward.set(0, 0, -1).applyAxisAngle(UP, yaw);
    const right = _right.set(1, 0, 0).applyAxisAngle(UP, yaw);

    const moveVector = _move.set(0, 0, 0);

    if (keys.current['ArrowUp'] || keys.current['KeyW']) {
        moveVector.add(forward);
    }
    if (keys.current['ArrowDown'] || keys.current['KeyS']) {
        moveVector.sub(forward);
    }
    if (keys.current['ArrowLeft'] || keys.current['KeyA']) {
        moveVector.sub(right);
    }
    if (keys.current['ArrowRight'] || keys.current['KeyD']) {
        moveVector.add(right);
    }

    // A requested focus point: back off from it along the view direction far enough that the
    // line of sight lands on it.
    if (cameraFocus.target) {
        const { x, z } = cameraFocus.target;
        cameraFocus.target = null;
        const back = lookAhead(positionRef.current.y);
        positionRef.current.x = Math.max(-maxPos, Math.min(maxPos, x - forward.x * back));
        positionRef.current.z = Math.max(-maxPos, Math.min(maxPos, z - forward.z * back));
    }

    // 3. Apply Movement
    if (moveVector.lengthSq() > 0) {
        moveVector.normalize().multiplyScalar(speed);
        positionRef.current.add(moveVector);
        
        // Clamp X/Z to map bounds
        positionRef.current.x = Math.max(-maxPos, Math.min(maxPos, positionRef.current.x));
        positionRef.current.z = Math.max(-maxPos, Math.min(maxPos, positionRef.current.z));
    }

    // 4. Smoothly interpolate actual camera position to target position
    // Note: We only lerp position. Rotation is instant for responsive aiming.
    // Frame-rate independent, and a little snappier than the old 0.1 per frame, which
    // left the view trailing well behind the keys.
    camera.position.lerp(positionRef.current, 1 - Math.exp(-12 * delta));

    updateGlobalFrustum(camera);

    // Sounds are heard from the middle of the view (components/sfx.ts).
    const ahead = lookAhead(camera.position.y);
    listen(camera.position.x - Math.sin(yaw) * ahead, camera.position.z - Math.cos(yaw) * ahead, yaw, camera.position.y);

    // 5. Sync State for Minimap
    if (cameraStateRef) {
        cameraStateRef.current = {
            x: positionRef.current.x,
            y: positionRef.current.y,
            z: positionRef.current.z,
            yaw
        };
    }
  }, -1);

  return null;
};

export default DroneCamera;
