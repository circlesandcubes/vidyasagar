export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      books: {
        Row: {
          id: string;
          title: string;
          slug: string;
          subtitle: string | null;
          description: string | null;
          author: string | null;
          cover_image_url: string | null;
          isbn: string | null;
          price_cents: number | null;
          currency: string | null;
          publication_date: string | null;
          status: Database["public"]["Enums"]["book_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          slug: string;
          subtitle?: string | null;
          description?: string | null;
          author?: string | null;
          cover_image_url?: string | null;
          isbn?: string | null;
          price_cents?: number | null;
          currency?: string | null;
          publication_date?: string | null;
          status?: Database["public"]["Enums"]["book_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          slug?: string;
          subtitle?: string | null;
          description?: string | null;
          author?: string | null;
          cover_image_url?: string | null;
          isbn?: string | null;
          price_cents?: number | null;
          currency?: string | null;
          publication_date?: string | null;
          status?: Database["public"]["Enums"]["book_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      book_status: "draft" | "published";
    };
    CompositeTypes: Record<string, never>;
  };
};
