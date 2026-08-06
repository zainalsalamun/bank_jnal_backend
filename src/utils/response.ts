export const formatSuccess = (data: any, meta: any = null) => {
  return {
    success: true,
    data,
    meta,
  };
};

export const formatError = (code: string, message: string, details: any = null) => {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
};
