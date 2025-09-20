import React, { useEffect, useId, forwardRef } from 'react';
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

  useEffect(() => {
    if (!lockScroll || !isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow || '';
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
