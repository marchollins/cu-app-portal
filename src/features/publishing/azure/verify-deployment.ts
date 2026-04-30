type VerifyOptions = {
  fetchImpl?: typeof fetch;
};

function isMicrosoftLoginRedirect(location: string | null) {
  if (!location) {
    return false;
  }

  try {
    return new URL(location).hostname.toLowerCase() ===
      "login.microsoftonline.com";
  } catch {
    return false;
  }
}

export async function verifyPublishedUrl(
  publishUrl: string,
  { fetchImpl = fetch }: VerifyOptions = {},
) {
  const response = await fetchImpl(publishUrl, {
    method: "GET",
    redirect: "manual",
  });
  const location = response.headers.get("location") ?? "";

  if (
    response.status === 200 ||
    (response.status >= 300 &&
      response.status < 400 &&
      isMicrosoftLoginRedirect(location))
  ) {
    return { verifiedAt: new Date() };
  }

  throw new Error(
    `Published URL ${publishUrl} did not return a healthy response. Status: ${response.status}.`,
  );
}
