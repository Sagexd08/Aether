let accessToken: string | null = null;

export const getAccessToken = (): string | null => accessToken;

export const setAccessToken = (value: string | null): void => {
  accessToken = value;
};
