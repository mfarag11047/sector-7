
import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMERA_SPEED, CITY_CONFIG, CAMERA_ZOOM_SPEED, MIN_ZOOM, MAX_ZOOM } from '../constants';

interface DroneCameraProps {
    cameraStateRef?: React.MutableRefObject<{ x: number, y: number, z: number, yaw: number }>;
}

const DroneCamera: React.FC<DroneCameraProps> = ({ cameraStateRef }) => {
  const { camera, gl } = useThree();
  
  // Position State
  const positionRef = useRef(new THREE.Vector3(0, 80, 80)); 
  
  // Rotation State
  // Yaw: Rotation around Y axis (0 = North/-Z)
  const yawRef = useRef(0); 
  // Pitch: Angle down from horizon (0 = Horizon, PI/2 = Straight Down)
  const pitchRef = useRef(1.0); 

  // Input State
  const keys = useRef<{ [key: string]: boolean }>({});
  const isDraggingRef = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  
  // Map Bounds
  const maxPos = (CITY_CONFIG.gridSize * CITY_CONFIG.tileSize) / 2;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    
    const handleMouseDown = (e: MouseEvent) => {
        // Only allow rotation on Right Click (Button 2)
        if (e.button === 2) { 
            isDraggingRef.current = true;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            gl.domElement.style.cursor = 'grabbing';
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDraggingRef.current) {
            const deltaX = e.clientX - lastMousePos.current.x;
            const deltaY = e.clientY - lastMousePos.current.y;
            
            const sensitivity = 0.004;

            // Yaw (Horizontal): Drag Left -> Look Left (Increase Angle in Three.js)
            yawRef.current -= deltaX * sensitivity;

            // Pitch (Vertical): Drag Up -> Look Up (Decrease Angle from Horizon)
            // Clamp between 0.1 (Horizon-ish) and 1.5 (Straight down)
            pitchRef.current = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, pitchRef.current + deltaY * sensitivity));
            
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseUp = () => {
        isDraggingRef.current = false;
        gl.domElement.style.cursor = 'auto';
    };

    // Prevent context menu on the canvas to allow smooth right-click dragging
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
  }, [gl.domElement]);

  // Handle Zoom separately via scroll
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
        // Zoom alters Y position (Altitude)
        positionRef.current.y += e.deltaY * 0.05 * (CAMERA_ZOOM_SPEED / 2);
        positionRef.current.y = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, positionRef.current.y));
    };
    
    window.addEventListener('wheel', handleWheel);
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  useFrame((state, delta) => {
    // 1. Apply Rotation directly from Yaw/Pitch refs
    // This ensures Key movement cannot affect Angle.
    camera.rotation.order = 'YXZ'; // Standard FPS rotation order
    camera.rotation.y = yawRef.current;
    camera.rotation.x = -pitchRef.current; // Negative because positive Pitch ref is "Down", but positive X rot is "Up"
    camera.rotation.z = 0; // Lock roll

    // 2. Calculate Movement Vector relative to Yaw
    const speed = CAMERA_SPEED * (positionRef.current.y / 20); // Move faster when zoomed out
    
    // "Forward" is -Z in local space. We rotate that by Yaw to get World Forward.
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRef.current);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRef.current);

    const moveVector = new THREE.Vector3(0, 0, 0);

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
    camera.position.lerp(positionRef.current, 0.1);

    // 5. Sync State for Minimap
    if (cameraStateRef) {
        cameraStateRef.current = {
            x: positionRef.current.x,
            y: positionRef.current.y,
            z: positionRef.current.z,
            yaw: yawRef.current
        };
    }
  });

  return null;
};

export default DroneCamera;
