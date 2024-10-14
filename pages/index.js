import React, { useEffect, useState } from 'react';
import Modal from 'react-modal';
import Component from '../components/component';

const Index = () => {
  // Ensure modal works with Next.js
  useEffect(() => {
    Modal.setAppElement('body');  // Set this to 'body' since there's no #root
  }, []);

  return (
    <>
      <style>{`
        body {
          margin: 0;
        }
      `}</style>
      <Component />
    </>
  );
};

export default Index;
 