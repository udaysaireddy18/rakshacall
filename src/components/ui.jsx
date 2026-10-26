import { useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ */
/* layout blocks                                                       */
/* ------------------------------------------------------------------ */

export function Card({ title, subtitle, actions, children, tone = 'default', className = '' }) {
  return (
    <section className={`card card--${tone} ${className}`.trim()}>
      {(title || actions) && (
        <header className="card__head">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}

export function Badge({ tone = 'neutral', children, big = false }) {
  return <span className={`badge badge--${tone} ${big ? 'badge--big' : ''}`.trim()}>{children}</span>;
}

export function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {hint && <span className="stat__hint">{hint}</span>}
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {body && <p className="empty__body">{body}</p>}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* controls                                                            */
/* ------------------------------------------------------------------ */

export function ScoreBar({ label, value, max = 100, tone = 'sky', hint }) {
  const pct = Math.max(0, Math.min(100, (Number(value) || 0) / max * 100));
  return (
    <div className="score">
      <div className="score__top">
        <span className="score__label">{label}</span>
        <span className={`score__value score__value--${tone}`}>
          {Math.round(Number(value) || 0)}
          {max === 100 ? <span className="score__max">/100</span> : null}
        </span>
      </div>
      <div className="score__track" role="progressbar" aria-valuenow={Math.round(Number(value) || 0)} aria-valuemin={0} aria-valuemax={max}>
        <div className={`score__fill score__fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {hint && <p className="score__hint">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled = false }) {
  return (
    <label className={`toggle ${disabled ? 'toggle--disabled' : ''}`.trim()}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="toggle__box" aria-hidden="true" />
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        {hint && <span className="toggle__hint">{hint}</span>}
      </span>
    </label>
  );
}

export function LevelMeter({ level = 0, tone = 'sky' }) {
  const pct = Math.max(0, Math.min(100, level * 600));
  return (
    <div className="level" aria-hidden="true">
      <div className={`level__fill level__fill--${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* waveform canvas                                                     */
/* ------------------------------------------------------------------ */

export function Waveform({ analyser, samples, height = 110, color = '#a78bfa', label }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    let frame = 0;

    const dpr = window.devicePixelRatio || 1;
    let width = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(10, rect.width);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const data = analyser ? new Uint8Array(analyser.fftSize) : null;

    const draw = () => {
      context.clearRect(0, 0, width, height);

      // baseline + subtle grid
      context.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.stroke();

      context.beginPath();

      if (analyser && data) {
        analyser.getByteTimeDomainData(data);
        for (let i = 0; i < data.length; i++) {
          const x = (i / (data.length - 1)) * width;
          const y = height / 2 + ((data[i] - 128) / 128) * (height / 2) * 0.92;
          if (i === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
      } else if (samples && samples.length) {
        const step = Math.max(1, Math.floor(samples.length / width));
        for (let i = 0; i < samples.length; i += step) {
          const x = (i / (samples.length - 1)) * width;
          const y = height / 2 + samples[i] * (height / 2) * 0.92;
          if (i === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
      } else {
        context.moveTo(0, height / 2);
        context.lineTo(width, height / 2);
      }

      context.strokeStyle = color;
      context.lineWidth = 2;
      context.lineJoin = 'round';
      context.stroke();

      if (analyser) frame = requestAnimationFrame(draw);
    };

    draw();

    const onResize = () => {
      resize();
      if (!analyser) draw();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [analyser, samples, height, color]);

  return (
    <div className="waveform">
      {label && <span className="waveform__label">{label}</span>}
      <canvas ref={canvasRef} style={{ height }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({ open, title, subtitle, onClose, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title || 'Dialog'}>
      <button type="button" className="modal__backdrop" aria-label="Close" onClick={onClose} />
      <div className={`modal__panel ${wide ? 'modal__panel--wide' : ''}`.trim()}>
        <header className="modal__head">
          <div>
            <h2 className="modal__title">{title}</h2>
            {subtitle && <p className="modal__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* misc                                                                */
/* ------------------------------------------------------------------ */

export function SensitivityNote({ sensitivity }) {
  const map = {
    strict: 'Strict: warns earlier. More false alarms, fewer missed impersonations.',
    balanced: 'Balanced: recommended for most families.',
    relaxed: 'Relaxed: fewer warnings, but a higher chance of missing an impersonation.',
  };
  return <p className="note">{map[sensitivity] || map.balanced}</p>;
}

export function VerdictPill({ verdict, name }) {
  if (verdict === 'match') return <Badge tone="ok">Voice matches {name || 'family'}</Badge>;
  if (verdict === 'uncertain') return <Badge tone="warn">Not sure it matches {name || 'family'}</Badge>;
  if (verdict === 'mismatch') return <Badge tone="danger">Does NOT match {name || 'family'}</Badge>;
  return <Badge tone="neutral">No voice to compare</Badge>;
}
