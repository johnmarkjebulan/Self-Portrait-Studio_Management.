import { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import './bookingDialog.css';
export default function BookingDialog({ title, onClose, children, busy=false }) {
  const ref=useRef(null), id=useId();
  useEffect(()=>{const node=ref.current; const previous=document.activeElement; node.showModal();return()=>{node.close();previous?.focus?.()}},[]);
  return createPortal(<dialog ref={ref} className="booking-dialog" aria-labelledby={id} onCancel={e=>{e.preventDefault();if(!busy)onClose()}} onClick={e=>{if(e.target===ref.current&&!busy)onClose()}}><section className="booking-dialog-inner"><header><h2 id={id}>{title}</h2><button type="button" aria-label="Close details" disabled={busy} onClick={onClose}>×</button></header><div className="booking-dialog-body">{children}</div></section></dialog>,document.body);
}
