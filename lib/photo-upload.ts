// Commit metadata once, after every object is stored. Failed batches expose no photos.
export async function storePhotoBatch<T>(
  keys: string[],
  put: (key: string, index: number) => Promise<unknown>,
  commit: () => Promise<T>,
  remove: (keys: string[]) => Promise<unknown>,
): Promise<T> {
  try {
    for (const [index, key] of keys.entries()) await put(key, index);
    return await commit();
  } catch (error) {
    // Include the failed put: the server may have accepted it before a transport error.
    await remove(keys);
    throw error;
  }
}
