/// <reference types="vite/client" />
// three ships no types and @types/three is a large extra download; we only touch a couple of classes
declare module 'three';
declare module 'three/examples/jsm/utils/BufferGeometryUtils.js';
