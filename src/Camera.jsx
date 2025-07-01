import React, { useRef } from 'react';

const Camera = ({ onCapture }) => {
  const fileInputRef = useRef(null);

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        onCapture(e.target.result);
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
      <button onClick={openFileDialog} className="camera-button">📷</button>
    </div>
  );
};

export default Camera;
