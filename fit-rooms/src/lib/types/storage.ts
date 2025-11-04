export type StorageBuckets = {
  checkins: {
    Objects: {
      name: string;
      id: string;
      bucket_id: string;
      owner: string | null;
      created_at: string;
      updated_at: string;
    };
  };
};
