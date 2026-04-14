const getNestedError = (name: string, errors: any) => {
  const keys = name.split('.');
  let error = errors;
  for (const key of keys) {
    if (!error || !error[key]) {
      return null;
    }
    error = error[key];
  }
  return error.message as string;
};

export default getNestedError;
