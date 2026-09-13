"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  clampProfilePhotoCrop,
  getProfilePhotoCropMetrics,
  type ProfilePhotoCrop,
} from "../../lib/profile-photo-crop";

type Point = { x: number; y: number };

export default function ProfilePhotoCropper({
  src,
  crop,
  onChange,
}: {
  src: string;
  crop: ProfilePhotoCrop;
  onChange: (crop: ProfilePhotoCrop) => void;
}) {
  const viewportRef = useRef<HTMLButtonElement>(null);
  const cropRef = useRef(crop);
  const pointersRef = useRef(new Map<number, Point>());
  const dragRef = useRef<{ point: Point; crop: ProfilePhotoCrop } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const [viewportSize, setViewportSize] = useState(320);
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setViewportSize(width);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);

  const metrics = getProfilePhotoCropMetrics({
    sourceWidth: naturalSize.width,
    sourceHeight: naturalSize.height,
    viewportSize,
    crop,
  });

  function updateCrop(next: ProfilePhotoCrop) {
    const safeCrop = clampProfilePhotoCrop(next);
    cropRef.current = safeCrop;
    onChange(safeCrop);
  }

  function beginDrag(point: Point) {
    dragRef.current = { point, crop: cropRef.current };
    pinchRef.current = null;
  }

  function beginPinch() {
    const points = Array.from(pointersRef.current.values());
    if (points.length < 2) return;
    pinchRef.current = {
      distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
      zoom: cropRef.current.zoom,
    };
    dragRef.current = null;
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size === 1) beginDrag(point);
    if (pointersRef.current.size === 2) beginPinch();
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const points = Array.from(pointersRef.current.values());
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      updateCrop({ ...cropRef.current, zoom: pinchRef.current.zoom * distance / Math.max(1, pinchRef.current.distance) });
      return;
    }

    if (!dragRef.current) return;
    const currentMetrics = getProfilePhotoCropMetrics({
      sourceWidth: naturalSize.width,
      sourceHeight: naturalSize.height,
      viewportSize,
      crop: dragRef.current.crop,
    });
    const deltaX = point.x - dragRef.current.point.x;
    const deltaY = point.y - dragRef.current.point.y;
    updateCrop({
      ...dragRef.current.crop,
      x: currentMetrics.maxPanX ? dragRef.current.crop.x + deltaX / currentMetrics.maxPanX : 0,
      y: currentMetrics.maxPanY ? dragRef.current.crop.y + deltaY / currentMetrics.maxPanY : 0,
    });
  }

  function finishPointer(event: PointerEvent<HTMLButtonElement>) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) beginDrag(Array.from(pointersRef.current.values())[0]);
    else if (pointersRef.current.size === 0) {
      dragRef.current = null;
      pinchRef.current = null;
    }
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, Partial<ProfilePhotoCrop>> = {
      ArrowLeft: { x: crop.x - 0.06 },
      ArrowRight: { x: crop.x + 0.06 },
      ArrowUp: { y: crop.y - 0.06 },
      ArrowDown: { y: crop.y + 0.06 },
      "+": { zoom: crop.zoom + 0.1 },
      "=": { zoom: crop.zoom + 0.1 },
      "-": { zoom: crop.zoom - 0.1 },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    updateCrop({ ...crop, ...move });
  }

  return (
    <div className="profile-cropper">
      <button
        type="button"
        ref={viewportRef}
        className="profile-crop-viewport"
        aria-label="Profile photo crop area. Drag to reposition, pinch or use the slider to zoom."
        onKeyDown={moveWithKeyboard}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={event => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          style={{ width: metrics.width, height: metrics.height, left: metrics.left, top: metrics.top }}
        />
        <span className="profile-crop-mask" aria-hidden="true" />
        <span className="profile-crop-grid" aria-hidden="true" />
      </button>
      <div className="profile-crop-controls">
        <button type="button" aria-label="Zoom out" onClick={() => updateCrop({ ...crop, zoom: crop.zoom - 0.1 })}>−</button>
        <label>Zoom<input type="range" min="1" max="3" step="0.01" value={crop.zoom} onChange={event => updateCrop({ ...crop, zoom: Number(event.target.value) })} /></label>
        <button type="button" aria-label="Zoom in" onClick={() => updateCrop({ ...crop, zoom: crop.zoom + 0.1 })}>+</button>
      </div>
      <button className="profile-crop-reset" type="button" onClick={() => updateCrop({ x: 0, y: 0, zoom: 1 })}>Center & reset</button>
      <p>Drag to reposition · pinch or use the slider to resize</p>
    </div>
  );
}
