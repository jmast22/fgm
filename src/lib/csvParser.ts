import Papa from 'papaparse';

export const parseCSVFile = <T>(file: File): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true, // Automatically convert numbers, booleans, etc.
      // Papaparse handles special characters well natively if the file is UTF-8 encoded
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn('CSV parsing finished with errors:', results.errors);
        }
        resolve(results.data);
      },
      error: (error: Error) => {
        reject(error);
      }
    });
  });
};

export const parseCSVString = <T>(csvString: string): T[] => {
  const result = Papa.parse<T>(csvString, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });
  
  if (result.errors.length > 0) {
    console.warn("CSV Parsing errors:", result.errors);
  }
  
  return result.data;
};
