import { MovieButlerChain } from "./movie-butler-chain.ts";
import type { ChainContext } from "./movie-butler-chain.ts";

console.log("OPENAI_API_KEY:", Deno.env.get("OPENAI_API_KEY") ? "SET" : "NOT SET");
console.log("SUPABASE_URL:", Deno.env.get("SUPABASE_URL") ? "SET" : "NOT SET");
console.log("SUPABASE_SERVICE_ROLE_KEY:", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ? "SET" : "NOT SET");
console.log("OMDB_API_KEY:", Deno.env.get("OMDB_API_KEY") ? "SET" : "NOT SET");

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

interface RequestPayload {
  query: string;
  userId: string | null;
  conversationId: string;
  sessionId: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== MOVIE QUERY EDGE FUNCTION START ===");
    
    // Parse request
    const payload: RequestPayload = await req.json();
    console.log("Request payload:", payload);

    // Validate required fields
    if (!payload.query) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payload.conversationId) {
      return new Response(
        JSON.stringify({ error: "Conversation ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create chain context
    const context: ChainContext = {
      userId: payload.userId,
      query: payload.query.trim(),
      conversationId: payload.conversationId,
      sessionId: payload.sessionId || `session_${Date.now()}`,
    };

    console.log("Chain context:", context);

    // Initialize and run the movie query chain
    const chain = new MovieButlerChain();
    const result = await chain.processQuery(context);

    console.log("Chain result:", result);
    console.log("=== MOVIE QUERY EDGE FUNCTION END ===");

    // Return successful response
    return new Response(
      JSON.stringify({ data: result }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json" 
        } 
      }
    );

  } catch (error: any) {
    console.error("Edge function error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json" 
        } 
      }
    );
  }
});

