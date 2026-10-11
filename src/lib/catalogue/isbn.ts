/** Mirrors public.is_valid_isbn13(): 13 digits, 978/979 prefix, valid check digit. */
export function normaliseIsbn13(input: string): string {
  return input.replace(/[\s-]/g, "");
}

export function isValidIsbn13(input: string): boolean {
  const isbn = normaliseIsbn13(input);
  if (!/^(978|979)\d{10}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(isbn[12]);
}
