import { useEffect, useState, useRef } from 'react';

interface SpinningWheelProps {
  items: string[];
  onPick: (item: string) => void;
  isSpinning: boolean;
}

export default function SpinningWheel({ items, onPick, isSpinning }: SpinningWheelProps) {
  const [rotation, setRotation] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const colors = [
    '#0ea5e9', '#38bdf8', '#0284c7', '#0369a1', '#075985',
    '#10b981', '#34d399', '#059669', '#047857', '#065f46'
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (items.length === 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 12px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('NO TEAMS LEFT', centerX, centerY);
      return;
    }

    const angleStep = (Math.PI * 2) / items.length;

    items.forEach((item, i) => {
      const startAngle = i * angleStep + rotation;
      const endAngle = (i + 1) * angleStep + rotation;

      // Draw slice
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw text
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + angleStep / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px Inter';
      ctx.fillText(item.length > 15 ? item.substring(0, 12) + '...' : item, radius - 20, 4);
      ctx.restore();
    });

    // Draw center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw pointer
    ctx.beginPath();
    ctx.moveTo(canvas.width - 5, centerY);
    ctx.lineTo(canvas.width - 25, centerY - 10);
    ctx.lineTo(canvas.width - 25, centerY + 10);
    ctx.closePath();
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    ctx.stroke();

  }, [items, rotation]);

  useEffect(() => {
    if (isSpinning) {
      let startTime: number | null = null;
      const duration = 3000; // 3 seconds
      const extraSpins = 5 + Math.random() * 5;
      const startRotation = rotation;
      const targetRotation = startRotation + extraSpins * Math.PI * 2;

      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function: easeOutCubic
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentRotation = startRotation + (targetRotation - startRotation) * easeOut;
        
        setRotation(currentRotation);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Calculate which item is at the pointer (at angle 0 or 2PI)
          // Pointer is at the right (0 rad in canvas terms usually, but let's check)
          // Canvas 0 rad is at 3 o'clock.
          const finalRotationNormalized = currentRotation % (Math.PI * 2);
          const angleStep = (Math.PI * 2) / items.length;
          
          // The item at the pointer is the one where (startAngle <= 0 <= endAngle)
          // Actually, since we're rotating the wheel clockwise, we need to subtract rotation from 0.
          let winningIndex = Math.floor((items.length - (finalRotationNormalized / angleStep)) % items.length);
          if (winningIndex < 0) winningIndex += items.length;
          
          onPick(items[winningIndex]);
        }
      };

      requestAnimationFrame(animate);
    }
  }, [isSpinning]);

  return (
    <div className="relative flex items-center justify-center">
      <canvas 
        ref={canvasRef} 
        width={300} 
        height={300} 
        className="rounded-full shadow-2xl border-4 border-surface-700/50"
      />
      <div className="absolute inset-0 rounded-full pointer-events-none border-[12px] border-surface-900/20" />
    </div>
  );
}
