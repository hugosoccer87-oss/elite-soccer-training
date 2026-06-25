"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

function configureCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 2.5;
  context.strokeStyle = "#06152b";
  return context;
}

export function SignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureImage, setSignatureImage] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    configureCanvas(canvas);

    const handleResize = () => {
      configureCanvas(canvas);
      setSignatureImage("");
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getPosition = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const beginDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const position = getPosition(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
    setIsDrawing(true);
  };

  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context || !isDrawing) {
      return;
    }

    event.preventDefault();
    const position = getPosition(event);
    context.lineTo(position.x, position.y);
    context.stroke();
  };

  const finishDrawing = () => {
    const canvas = canvasRef.current;

    if (!canvas) {
      setIsDrawing(false);
      return;
    }

    setIsDrawing(false);
    setSignatureImage(canvas.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    configureCanvas(canvas);
    setSignatureImage("");
  };

  return (
    <div className="grid gap-3">
      <canvas
        ref={canvasRef}
        className="h-44 w-full touch-none rounded-md border border-slate-300 bg-white"
        aria-label="Draw signature"
        onPointerDown={beginDrawing}
        onPointerMove={draw}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
        onPointerLeave={() => {
          if (isDrawing) {
            finishDrawing();
          }
        }}
      />
      <input type="hidden" name="drawnSignature" value={signatureImage} />
      <button
        type="button"
        onClick={clearSignature}
        className="w-fit rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-navy transition hover:border-electric hover:text-electric"
      >
        Clear Signature
      </button>
    </div>
  );
}
