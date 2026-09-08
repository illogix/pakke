// One continuous coordinate transform for rendering, grid lines and input.
import { workspaceBounds } from '../core/workspace.js';
import { placedCells } from '../core/puzzle.js';

export function displayPoint(field, rotation, x, y) {
    switch (rotation) {
        case 1: return [field.height - y, x];
        case 2: return [field.width - x, field.height - y];
        case 3: return [y, field.width - x];
        default: return [x, y];
    }
}
export function canonicalPoint(field, rotation, x, y) {
    switch (rotation) {
        case 1: return [y, field.height - x];
        case 2: return [field.width - x, field.height - y];
        case 3: return [field.width - y, x];
        default: return [x, y];
    }
}
export function displayBox(def, box) {
    const r = def.presentation?.fieldRotation ?? 0;
    const a = displayPoint(def.field, r, box.minX, box.minY);
    const b = displayPoint(def.field, r, box.maxX, box.maxY);
    return { minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]) };
}
const fit = (viewport, box, pad = 20) => Math.max(0.01, Math.min(
    Math.max(1, viewport.width - pad * 2) / (box.maxX - box.minX),
    Math.max(1, viewport.height - pad * 2) / (box.maxY - box.minY)));
export function createCamera(def, viewport) {
    const workspace = displayBox(def, workspaceBounds(def));
    const initialBox = displayBox(def, { minX: 0, minY: 0, maxX: def.field.width, maxY: def.field.height });
    const initialSize = Math.min(46, fit(viewport, initialBox));
    const initial = { x: (initialBox.minX + initialBox.maxX) / 2, y: (initialBox.minY + initialBox.maxY) / 2, size: initialSize };
    return clampCamera({ viewport, workspace, minSize: Math.min(initialSize, fit(viewport, workspace, 12)), maxSize: Math.max(initialSize, 72), initial, ...initial });
}
export function clampCamera(camera) {
    const c = { ...camera, size: Math.max(camera.minSize, Math.min(camera.maxSize, camera.size)) };
    for (const [axis, extent, lo, hi] of [['x','width','minX','maxX'], ['y','height','minY','maxY']]) {
        const half = c.viewport[extent] / c.size / 2;
        c[axis] = half * 2 >= c.workspace[hi] - c.workspace[lo]
            ? (c.workspace[lo] + c.workspace[hi]) / 2
            : Math.max(c.workspace[lo] + half, Math.min(c.workspace[hi] - half, c[axis]));
    }
    return c;
}
export function displayToScreen(c, x, y) {
    return [c.viewport.width / 2 + (x - c.x) * c.size, c.viewport.height / 2 + (y - c.y) * c.size];
}
export function screenToDisplay(c, x, y) {
    return [c.x + (x - c.viewport.width / 2) / c.size, c.y + (y - c.viewport.height / 2) / c.size];
}
export function screenToWorld(def, camera, x, y) {
    return canonicalPoint(def.field, def.presentation?.fieldRotation ?? 0, ...screenToDisplay(camera, x, y));
}
export function worldToScreen(def, camera, x, y) {
    return displayToScreen(camera, ...displayPoint(def.field, def.presentation?.fieldRotation ?? 0, x, y));
}
export function displayCell(def, x, y) {
    const p = displayPoint(def.field, def.presentation?.fieldRotation ?? 0, x + 0.5, y + 0.5);
    return [p[0] - 0.5, p[1] - 0.5];
}
export function zoomAt(camera, factor, point, destination = point) {
    const before = screenToDisplay(camera, ...point);
    const size = Math.max(camera.minSize, Math.min(camera.maxSize, camera.size * factor));
    return clampCamera({ ...camera, size,
        x: before[0] - (destination[0] - camera.viewport.width / 2) / size,
        y: before[1] - (destination[1] - camera.viewport.height / 2) / size });
}
export function panCamera(camera, dx, dy) {
    return clampCamera({ ...camera, x: camera.x - dx / camera.size, y: camera.y - dy / camera.size });
}
export function reframeCamera(def, state, camera) {
    const cells = [...def.container.cells, ...def.pieces.flatMap(p => placedCells(p, state.placements[p.id]))];
    const points = cells.map(([x,y]) => displayCell(def,x,y));
    const box = { minX: Math.min(...points.map(p=>p[0])), minY: Math.min(...points.map(p=>p[1])), maxX: Math.max(...points.map(p=>p[0]))+1, maxY: Math.max(...points.map(p=>p[1]))+1 };
    return clampCamera({ ...camera, x: (box.minX+box.maxX)/2, y: (box.minY+box.maxY)/2, size: Math.min(46, fit(camera.viewport, box, 28)) });
}
export function cameraIsInitial(c) {
    return Math.abs(c.x-c.initial.x)<0.001 && Math.abs(c.y-c.initial.y)<0.001 && Math.abs(c.size-c.initial.size)<0.001;
}
