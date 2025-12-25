import React, { useEffect, useId, forwardRef, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import styles from './ModalShell.module.css';

const join = (...classes) => classes.filter(Boolean).join(' ');
const capitalize = (value = '') => value.charAt(0).toUpperCase() + value.slice(1);

const ModalShell = ({
  isOpen,
  onClose,
  title,
  size = 'md',
  lockScroll = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  ariaDescribedBy,
  children,
  contentClassName,
}) => {
  const titleId = useId();
  const scrollLockRef = useRef(null);

  useEffect(() => {
    if (!lockScroll || !isOpen) return undefined;
    const body = document.body;
    const html = document.documentElement;
    const activeLocks = Number(body.dataset.modalLockCount || '0');
    if (activeLocks === 0) {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const scrollBarGap = window.innerWidth - html.clientWidth;
      const fullHeight = Math.max(body.scrollHeight, html.scrollHeight);
      scrollLockRef.current = {
        scrollY,
        body: {
          position: body.style.position,
          top: body.style.top,
          left: body.style.left,
          right: body.style.right,
          width: body.style.width,
          height: body.style.height,
          overflow: body.style.overflow,
          paddingRight: body.style.paddingRight,
        },
        html: {
          overflow: html.style.overflow,
        },
      };
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.height = `${fullHeight}px`;
      body.style.overflow = 'hidden';
      html.style.overflow = 'hidden';
      if (scrollBarGap > 0) {
        body.style.paddingRight = `${scrollBarGap}px`;
      }
    }
    body.dataset.modalLockCount = String(activeLocks + 1);
    return () => {
      const nextLocks = Math.max(Number(body.dataset.modalLockCount || '1') - 1, 0);
      if (nextLocks === 0) {
        const previous = scrollLockRef.current;
        if (previous) {
          body.style.position = previous.body?.position || '';
          body.style.top = previous.body?.top || '';
          body.style.left = previous.body?.left || '';
          body.style.right = previous.body?.right || '';
          body.style.width = previous.body?.width || '';
          body.style.height = previous.body?.height || '';
          body.style.overflow = previous.body?.overflow || '';
          body.style.paddingRight = previous.body?.paddingRight || '';
          html.style.overflow = previous.html?.overflow || '';
          window.scrollTo(0, previous.scrollY || 0);
          scrollLockRef.current = null;
        } else {
          body.style.position = '';
          body.style.top = '';
          body.style.left = '';
          body.style.right = '';
          body.style.width = '';
          body.style.height = '';
          body.style.overflow = '';
          body.style.paddingRight = '';
          html.style.overflow = '';
        }
        delete body.dataset.modalLockCount;
      } else {
        body.dataset.modalLockCount = String(nextLocks);
      }
    };
  }, [isOpen, lockScroll]);

  useEffect(() => {
    if (!isOpen || !closeOnEscape || !onClose) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen) return null;

  const sizeClass = size === 'md' ? null : styles[`content${capitalize(size)}`];
  const contentClass = join(styles.content, sizeClass, contentClassName);

  const handleBackdropClick = (event) => {
    if (event.target !== event.currentTarget) return;
    if (!closeOnBackdrop) return;
    if (onClose) onClose();
  };

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div
        className={contentClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={ariaDescribedBy}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h3 className={styles.title} id={titleId}>
            {title}
          </h3>
          {onClose && (
            <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Close">
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </header>
        {children}
      </div>
    </div>
  );
};

const Body = ({ children, className, ...props }) => (
  <div className={join(styles.body, className)} {...props}>
    {children}
  </div>
);

const footerAlignClass = (align) => {
  switch (align) {
    case 'left':
      return styles.footerAlignLeft;
    case 'center':
      return styles.footerAlignCenter;
    case 'space-between':
      return styles.footerAlignSpaceBetween;
    case 'right':
    default:
      return styles.footerAlignRight;
  }
};

const Footer = ({ children, align = 'right', className, ...props }) => (
  <div className={join(styles.footer, footerAlignClass(align), className)} {...props}>
    {children}
  </div>
);

const Button = forwardRef(({ variant = 'secondary', className, type = 'button', ...props }, ref) => {
  const variantClass = styles[`button${capitalize(variant)}`];
  return (
    <button
      ref={ref}
      type={type}
      className={join(styles.button, variantClass, className)}
      {...props}
    />
  );
});

Button.displayName = 'ModalShell.Button';

ModalShell.Body = Body;
ModalShell.Footer = Footer;
ModalShell.Button = Button;

export default ModalShell;
