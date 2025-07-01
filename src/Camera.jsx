import React, { useRef } from 'react';

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
          const TARGET_SIZE = 768;
          let width = img.width;
          let height = img.height;
          let x = 0;
          let y = 0;

          if (width < height) {
            const scale = TARGET_SIZE / width;
            width = TARGET_SIZE;
            height = Math.floor(height * scale);
            y = Math.floor((height - TARGET_SIZE) / 2);
          } else {
            const scale = TARGET_SIZE / height;
            height = TARGET_SIZE;
            width = Math.floor(width * scale);
            x = Math.floor((width - TARGET_SIZE) / 2);
          }

          canvas.width = TARGET_SIZE;
          canvas.height = TARGET_SIZE;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, x, y, TARGET_SIZE, TARGET_SIZE, 0, 0, TARGET_SIZE, TARGET_SIZE);

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
        {isProcessing ? '...' : '📷'}
      </button>
    </div>
  );
};

export default Camera;
