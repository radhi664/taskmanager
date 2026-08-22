/**
 * Loads optional browser performance metrics when a reporting callback is supplied.
 * This keeps monitoring code out of the normal ticket-system bundle path when unused.
 *
 * @param {Function} onPerfEntry - Callback that receives each Web Vitals measurement.
 * @returns {void}
 */
const reportWebVitals = onPerfEntry => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(onPerfEntry);
      getFID(onPerfEntry);
      getFCP(onPerfEntry);
      getLCP(onPerfEntry);
      getTTFB(onPerfEntry);
    });
  }
};

export default reportWebVitals;
