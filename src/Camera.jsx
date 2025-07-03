import React, { useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera } from '@fortawesome/free-solid-svg-icons';

const Camera = ({ onCapture, isProcessing }) => {
  const fileInputRef = useRef(null);

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_PIXELS = 2000000;
          let width = img.width;
          let height = img.height;

          if (width * height > MAX_PIXELS) {
            const ratio = Math.sqrt((width * height) / MAX_PIXELS);
            width = Math.floor(width / ratio);
            height = Math.floor(height / ratio);
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          onCapture(dataUrl);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const openFileDialog = () => {
    fileInputRef.current.click();
  };

  return (
    <div>
      {isMobile ? (
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          ref={fileInputre => {
            fileInputRef.current = fileInputre;
          }}
        />
      ) : (
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          ref={fileInputre => {
            fileInputRef.current = fileInputre;
          }}
        />
      )}
      <button onClick={openFileDialog} className="camera-button" disabled={isProcessing}>
        {isProcessing ? '...' : <FontAwesomeIcon icon={faCamera} />}
      </button>
    </div>
  );
};

export default Camera;
