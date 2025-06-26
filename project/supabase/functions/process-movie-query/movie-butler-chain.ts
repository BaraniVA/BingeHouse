import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import { ChatOpenAI } from "npm:langchain@0.1.25/chat_models/openai";
import { PromptTemplate } from "npm:langchain@0.1.25/prompts";
import { LLMChain } from "npm:langchain@0.1.25/chains";
import { BufferWindowMemory } from "npm:langchain@0.1.25/memory";
import { ConversationChain } from "npm:langchain@0.1.25/chains";

// Declare Deno global for TypeScript
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

interface ChainContext {
  userId: string | null;
  query: string;
  conversationId: string;
  sessionId: string;
}

interface LogEntry {
  step: string;
  status: 'START' | 'SUCCESS' | 'ERROR' | 'SKIP';
  timestamp: string;
  details?: any;
  tokensUsed?: number;
  error?: string;
}

interface ConversationMemory {
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
  discussedMovies: Array<{ title: string; genre?: string; rating?: string }>;
  userPreferences: { genres: string[]; lastContext: string };
  totalTokens: number;
  turnCount: number;
}

export class MovieButlerChain {
  private supabase: any;
  private llm: ChatOpenAI;
  private omdbApiKey: string;
  private logs: LogEntry[] = [];
  private titleExtractionChain: LLMChain;
  private recommendationChain: LLMChain;
  private conversationChain: ConversationChain;
  private memory: BufferWindowMemory;
  private conversationStore = new Map<string, ConversationMemory>();

  constructor() {
    this.log('INITIALIZATION', 'START', 'Initializing MovieButlerChain');
    
    // Initialize Supabase client
    this.supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    this.log('SUPABASE_INIT', 'SUCCESS', 'Supabase client initialized');

    // Initialize OpenAI LLM
    this.llm = new ChatOpenAI({
      openAIApiKey: Deno.env.get("OPENAI_API_KEY") || "",
      modelName: "gpt-3.5-turbo",
      temperature: 0.7,
      maxTokens: 150,
    });
    this.log('LLM_INIT', 'SUCCESS', 'OpenAI LLM initialized');

    // Get OMDB API key
    this.omdbApiKey = Deno.env.get("OMDB_API_KEY") || "";
    this.log('OMDB_INIT', this.omdbApiKey ? 'SUCCESS' : 'ERROR', 
      this.omdbApiKey ? 'OMDB API key loaded' : 'OMDB API key missing');    // Initialize LangChain memory
    this.memory = new BufferWindowMemory({
      k: 10, // Increased from 6 to 10 for better context retention
      returnMessages: true,
    });
    this.log('MEMORY_INIT', 'SUCCESS', 'LangChain memory initialized');

    // Initialize chains
    this.initializeChains();
    this.log('INITIALIZATION', 'SUCCESS', 'MovieButlerChain fully initialized');
  }

  private log(step: string, status: LogEntry['status'], details: any, tokensUsed?: number, error?: string) {
    const logEntry: LogEntry = {
      step,
      status,
      timestamp: new Date().toISOString(),
      details,
      tokensUsed,
      error
    };

    this.logs.push(logEntry);
    
    // Console log for debugging
    console.log(`[${status}] ${step}:`, {
      timestamp: logEntry.timestamp,
      details: typeof details === 'object' ? JSON.stringify(details, null, 2) : details,
      tokensUsed,
      error
    });
  }

  private initializeChains() {
    this.log('CHAINS_INIT', 'START', 'Initializing LangChain chains');

    try {      // Title extraction chain for contextual movie identification
      const titleExtractionPrompt = PromptTemplate.fromTemplate(`
        You are a movie butler who understands context and conversation flow.

        Previous conversation: {context}
        User query: "{query}"

        CRITICAL RULES:
        - If the query is asking for comparison ("which is better", "which one is better", "Movie A or Movie B"), return "COMPARISON_QUESTION"
        - If the query is a simple response ("yes", "no", "sure", "yeah", "yep", "nope"), return "SIMPLE_RESPONSE"
        - If the query is asking about preference without naming a movie ("so this is better", "that one is better"), return "PREFERENCE_QUESTION"
        - If asking for general recommendations ("recommend something", "suggest movies"), return "GENERAL_RECOMMENDATION"
        - If asking for genre/style recommendations ("suggest a slow burn movie", "recommend action films", "any good thrillers"), return "GENERAL_RECOMMENDATION"
        - If asking for similar movie recommendations ("recommend similar", "can you recommend similar movie"), return "SIMILAR_RECOMMENDATION"
        - If asking follow-up questions about discussed movies ("tell me more", "what else", "more about"), return "FOLLOW_UP_QUESTION"
        - Only extract movie titles when user is clearly asking ABOUT a specific movie

        Intelligence rules for movie extraction:
        - "how is [movie]", "how was [movie]" = extract the movie name (e.g., "how is 28 days later" → "28 Days Later")
        - "give recommendation for [movie]" = extract the movie name
        - "recent one", "latest", "new one" = extract base movie name only (e.g., "Mission Impossible" not "Mission Impossible 2024")
        - "no, the other one" = they want a different movie with similar name
        - Include actor names in search (e.g., "Tom Cruise Top Gun")
        - "original" vs "remake" - understand the distinction
        - If they reference a previous movie, extract just the base franchise name
        - Context matters: understand what franchise they're talking about
        - For direct movie mentions with context, extract the movie name
        - IMPORTANT: When user specifies year AND actor, preserve BOTH (e.g., "Ace 2025 with Vijay Sethupathi" → "Ace 2025 Vijay Sethupathi")
        - For year-specific searches, include the year in extraction (e.g., "Ace released in 2025" → "Ace 2025")
        - For actor-specific searches, include actor name (e.g., "Ace with Vijay Sethupathi" → "Ace Vijay Sethupathi")

        Examples:
        - "how is 28 days later" → "28 Days Later"
        - "give recommendation for Batman" → "Batman"
        - "which is better" → "COMPARISON_QUESTION"
        - "Batman or Superman" → "COMPARISON_QUESTION"
        - "which is better forrest gump or the pianist" → "COMPARISON_QUESTION"
        - "yes" → "SIMPLE_RESPONSE"
        - "so this is better than superman 1978" → "PREFERENCE_QUESTION"
        - "recommend something good" → "GENERAL_RECOMMENDATION"
        - "suggest a slow burn movie" → "GENERAL_RECOMMENDATION"
        - "any good action movies" → "GENERAL_RECOMMENDATION"
        - "can you recommend similar movie" → "SIMILAR_RECOMMENDATION"
        - "recommend similar" → "SIMILAR_RECOMMENDATION"
        - "tell me more about it" → "FOLLOW_UP_QUESTION"
        - "Mission Impossible 2024" → "Mission Impossible 2024"
        - "the latest Batman" → "Batman"
        - "Top Gun with Tom Cruise" → "Top Gun Tom Cruise"
        - "Superman 1978" → "Superman 1978"
        - "Ace released in 2025" → "Ace 2025"
        - "Ace 2025 with Vijay Sethupathi" → "Ace 2025 Vijay Sethupathi"
        - "Ace with Vijay Sethupathi" → "Ace Vijay Sethupathi"

        For movie extraction: Extract the COMPLETE movie title/franchise they're looking for, INCLUDING years and actors when specified.
        For non-movie queries: Return the appropriate response type.
        Return ONLY the result, nothing else.
      `);
      
      this.titleExtractionChain = new LLMChain({
        llm: new ChatOpenAI({
          openAIApiKey: Deno.env.get("OPENAI_API_KEY") || "",
          modelName: "gpt-3.5-turbo",
          temperature: 0.3,
          maxTokens: 60,
        }),
        prompt: titleExtractionPrompt,
      });      this.log('TITLE_CHAIN_INIT', 'SUCCESS', 'Title extraction chain initialized');

      // Recommendation chain for human-like movie advice with similar suggestions
      const recommendationPrompt = PromptTemplate.fromTemplate(
        `You are JARVIS, specialized in movies. Provide insightful, concise recommendations.

Context: {contextInfo}
Movie: "{title}" ({year}) | Rating: {rating}/10 | Genre: {genre}
Plot: {plot}

Provide a complete structured recommendation starting with the movie title:

Format: "{title}" ({year}) - [Brief Assessment]. [Appeal/Target Audience]. Similar movies: [Movie1], [Movie2], [Movie3].

Requirements:
1. Start with movie title and year in quotes
2. Assessment: 1-2 concise sentences highlighting key strengths, standout elements, or notable aspects (35-50 words)
3. Appeal: Who would enjoy this and why - be specific about mood, preferences, or interests (20-30 words)
4. Similar movies: "Similar movies: [Movie1], [Movie2], [Movie3]." - Include 3 specific, relevant movies

Keep the entire recommendation focused and valuable without unnecessary elaboration.

Example: "The Dark Knight" (2008) - Christopher Nolan's elevated superhero masterpiece featuring Heath Ledger's iconic Joker and complex moral themes. Perfect for fans of intelligent action films with psychological depth and philosophical undertones. Similar movies: Joker, Batman Begins, Heat.`
      );
      
      this.recommendationChain = new LLMChain({
        llm: new ChatOpenAI({
          openAIApiKey: Deno.env.get("OPENAI_API_KEY") || "",
          modelName: "gpt-3.5-turbo",
          temperature: 0.7,
          maxTokens: 280, // Increased for detailed but concise recommendations
        }),
        prompt: recommendationPrompt,
      });
      this.log('RECOMMENDATION_CHAIN_INIT', 'SUCCESS', 'Recommendation chain initialized');      // General conversation chain for butler-like interactions
      const conversationalPrompt = PromptTemplate.fromTemplate(`
        You are JARVIS, but for movies - an intelligent, sophisticated AI movie advisor with perfect memory and intuitive understanding.

        Previous conversation:
        {history}

        Current message: {input}

        Respond like JARVIS would - be conversational, warm, and maintain perfect context:

        CONVERSATION FLOW RULES:
        - If this is a new conversation (no history), greet briefly and ask what movie interests them
        - ALWAYS remember and reference previous movies discussed in the conversation
        - For "yes/yep/sure/yeah" responses, understand what they're agreeing to based on context and offer follow-up suggestions
        - For "no/nope" responses, understand what they're declining and offer alternatives
        - For comparison questions like "which is better" WITHOUT movie names, compare the two most recently mentioned movies
        - For comparison questions WITH movie names like "Movie A or Movie B", compare those specific movies
        - When they ask for recommendations like "recommend similar movie" or "can you recommend similar", suggest movies similar to the last discussed film
        - When they ask for general recommendations without context, suggest 3-4 popular movies with brief reasons
        - When they ask for GENRE/STYLE specific recommendations ("suggest a slow burn movie", "any good thrillers", "recommend action films"), provide 3-4 movies of that specific genre/style with brief explanations
        - For follow-up questions about movies already discussed, provide additional insights without repeating basic info
        - Never ignore conversation context - always build upon what was previously discussed
        - Keep responses conversational but informative (2-4 sentences)
        - Always provide value - insights, recommendations, or thoughtful comparisons

        EXAMPLES OF CONTEXTUAL RESPONSES:
        - After discussing movies, if user says "which is better" → "Between The Pianist and Forrest Gump, I'd lean toward [choice] because [reasons]"
        - If user says "Forrest Gump or The Pianist" → Compare these two specific movies directly
        - If user says "recommend similar movie" → "Since you enjoyed [last movie], you might love [Movie X], [Movie Y], and [Movie Z] for similar [reasons]"
        - If user says "yep" → "Great! Since you're interested in that style, you might also enjoy [Movie X] and [Movie Y] for similar reasons."
        - New conversation → "Hello! I'm your movie advisor. What film has caught your interest today?"
        - Follow-up about a discussed movie → "Ah, more about [Movie]! [Additional insight] You might also find [related aspect] interesting."
        - Genre request → "suggest a slow burn movie" → "For slow burn films, I'd highly recommend [Movie 1] for its [reason], [Movie 2] for [reason], and [Movie 3] for [reason]. Each builds tension masterfully."

        COMPARISON FORMAT:
        When comparing movies, structure your response as:
        "Between [Movie A] and [Movie B], I'd lean toward [choice] because [specific reasons]. [Movie A] excels at [strengths] while [Movie B] offers [different strengths]. For [audience type], I'd definitely recommend [Movie A/B]."

        RECOMMENDATION FORMAT:
        When recommending similar movies, structure your response as:
        "Since you enjoyed [recently discussed movie], I'd recommend [Movie 1] for [reason], [Movie 2] for [reason], and [Movie 3] for [reason]. All share [common element] with [original movie]."

        GENRE RECOMMENDATION FORMAT:
        When recommending by genre/style, structure your response as:
        "For [genre/style] films, I'd highly recommend [Movie 1] for its [specific quality], [Movie 2] for [different quality], and [Movie 3] for [unique aspect]. Each delivers excellent [genre characteristic]."

        CONTEXTUAL AWARENESS:
        - Track what movies have been mentioned and discussed
        - Understand implied references ("that one", "the first one", "this movie")
        - Remember user preferences shown through their questions and reactions
        - Build naturally on previous exchanges without being repetitive
        - When user asks for genre recommendations, suggest movies that fit that genre perfectly

        Be natural, helpful, and always maintain conversation flow. Never give generic responses when context exists.
        `);        this.conversationChain = new ConversationChain({
        llm: new ChatOpenAI({
          openAIApiKey: Deno.env.get("OPENAI_API_KEY") || "",
          modelName: "gpt-3.5-turbo",
          temperature: 0.8,
          maxTokens: 250, // Increased for better contextual responses and comparisons
        }),
        memory: this.memory,
        prompt: conversationalPrompt,
      });
      this.log('CONVERSATION_CHAIN_INIT', 'SUCCESS', 'Conversation chain initialized');

      this.log('CHAINS_INIT', 'SUCCESS', 'All LangChain chains initialized successfully');
    } catch (error: any) {
      this.log('CHAINS_INIT', 'ERROR', 'Failed to initialize chains', undefined, error.message);
      throw error;
    }
  }

  public async processQuery(context: ChainContext): Promise<any> {
    this.logs = []; // Reset logs for new query
    this.log('PROCESS_QUERY', 'START', {
      userId: context.userId,
      query: context.query,
      conversationId: context.conversationId
    });

    try {
      // Step 1: Load or create conversation memory
      const conversation = await this.loadConversation(context.conversationId);
      this.log('CONVERSATION_LOAD', 'SUCCESS', {
        turnCount: conversation.turnCount,
        discussedMovies: conversation.discussedMovies.length,
        totalTokens: conversation.totalTokens
      });

      // Step 2: Save user message to conversation
      await this.saveUserMessage(context.conversationId, context.query);
      this.log('USER_MESSAGE_SAVE', 'SUCCESS', 'User message saved to conversation');

      // Step 3: Check if this is a general conversation or movie query
      const isGeneralConversation = await this.detectGeneralConversation(context.query);
      this.log('QUERY_TYPE_DETECTION', 'SUCCESS', { isGeneralConversation });

      if (isGeneralConversation) {
        return await this.handleGeneralConversation(context);
      }      // Step 4: Extract movie title(s) from query
      const movieTitles = await this.extractMovieTitles(context.query, context.conversationId);
      this.log('TITLE_EXTRACTION', movieTitles.length > 0 ? 'SUCCESS' : 'ERROR', {
        extractedTitles: movieTitles,
        query: context.query
      });

      if (movieTitles.length === 0) {
        // Better fallback response based on conversation context
        const conversation = this.conversationStore.get(context.conversationId);
        let fallbackResponse = "I couldn't identify a movie in your query. Could you please specify which movie you're asking about?";
        
        if (conversation && conversation.discussedMovies.length > 0) {
          const lastMovie = conversation.discussedMovies[conversation.discussedMovies.length - 1];
          
          // Check if user is asking for sequel/different version
          const isSequelRequest = /sequel|next|follow.up|part\s+2|part\s+ii|1984/i.test(context.query);
          if (isSequelRequest) {
            fallbackResponse = `I understand you're looking for a sequel or different version of "${lastMovie.title}". Could you be more specific? For example, try "Wonder Woman 1984" if you're looking for that specific movie.`;
          } else {
            fallbackResponse = `I'm not sure which movie you're referring to. Are you asking about "${lastMovie.title}" or a different film? Please clarify.`;
          }
        }
        
        await this.saveAssistantMessage(context.conversationId, fallbackResponse, undefined, context.userId);
        return { message: fallbackResponse, logs: this.logs };
      }

      // Anti-repetition check: if extracted title is the same as last movie and user seems to want something different
      const lastMovie = conversation?.discussedMovies[conversation.discussedMovies.length - 1];
      const isDifferentRequest = /sequel|different|another|else|1984|new|next/i.test(context.query);
      
      if (lastMovie && movieTitles.length > 0 && isDifferentRequest) {
        const extractedTitle = movieTitles[0].toLowerCase();
        const lastTitle = lastMovie.title.toLowerCase();        
        // If extracted title is too similar to last movie but user wants something different
        if (extractedTitle === lastTitle || this.extractBaseTitle(extractedTitle) === this.extractBaseTitle(lastTitle)) {
          this.log('ANTI_REPETITION_CHECK', 'SUCCESS', {
            extractedTitle,
            lastTitle,
            userQuery: context.query,
            reason: 'User wants different movie but got same title'
          });
          
          const clarificationResponse = `I see you mentioned "${movieTitles[0]}", but it seems like you might be looking for a different movie or sequel. Could you be more specific? For example, if you're looking for Wonder Woman's sequel, try "Wonder Woman 1984".`;
          await this.saveAssistantMessage(context.conversationId, clarificationResponse, undefined, context.userId);
          return { message: clarificationResponse, logs: this.logs };
        }
      }

      // Step 5: Search database first (user's personal collection)
      let movieData = await this.searchDatabase(movieTitles, context.userId);
      this.log('DATABASE_SEARCH', movieData ? 'SUCCESS' : 'SKIP', {
        found: !!movieData,
        movieTitle: movieData?.title || 'none',
        searchedTitles: movieTitles
      });

      // Step 6: Search OMDB if not found in database
      if (!movieData) {
        movieData = await this.searchOMDB(movieTitles);
        this.log('OMDB_SEARCH', movieData ? 'SUCCESS' : 'ERROR', {
          found: !!movieData,
          movieTitle: movieData?.Title || 'none',
          searchedTitles: movieTitles
        });        if (!movieData) {
          // Intelligent fallback response based on conversation context
          const conversation = this.conversationStore.get(context.conversationId);
          let notFoundResponse = `I couldn't find information about "${movieTitles[0]}". Could you check the spelling or try asking about a different movie?`;
          
          // If we have conversation context, provide better guidance
          if (conversation && conversation.discussedMovies.length > 0) {
            const lastMovie = conversation.discussedMovies[conversation.discussedMovies.length - 1];
            
            // Check if they're looking for a different version/country of the same movie
            if (movieTitles[0].toLowerCase().includes('korean') || 
                movieTitles[0].toLowerCase().includes('japanese') ||
                context.query.toLowerCase().includes('korean') ||
                context.query.toLowerCase().includes('japanese')) {
              notFoundResponse = `I couldn't find a Korean version of "${lastMovie.title}". You might be thinking of a different Korean film with a similar theme. Could you provide more details or try searching for specific Korean movie titles?`;
            } else {
              notFoundResponse = `I couldn't find "${movieTitles[0]}". Are you looking for something similar to "${lastMovie.title}" that we discussed earlier, or a completely different movie?`;
            }
          }
          
          await this.saveAssistantMessage(context.conversationId, notFoundResponse, undefined, context.userId);
          return { message: notFoundResponse, logs: this.logs };
        }
      }

      // Step 7: Normalize movie data structure
      const normalizedMovie = this.normalizeMovieData(movieData);
      this.log('MOVIE_NORMALIZATION', 'SUCCESS', {
        title: normalizedMovie.title,
        year: normalizedMovie.year,
        rating: normalizedMovie.imdbRating,
        source: movieData.id ? 'database' : 'omdb'
      });

      // Step 8: Save to database first to ensure user has the movie record
      if (context.userId) {
        const savedData = await this.saveToDatabase(normalizedMovie, { recommendation: "temp", worth_watching: true }, context.userId);
        this.log('DATABASE_SAVE', savedData.success ? 'SUCCESS' : 'ERROR', {
          movieSaved: savedData.movieSaved,
          error: savedData.error
        });
        
        // Update the normalized movie with the correct user-specific movie ID
        if (savedData.movieId) {
          normalizedMovie.id = savedData.movieId;
        }
      } else {
        this.log('DATABASE_SAVE', 'SKIP', 'No user ID provided - guest user');
      }

      // Step 9: Check for existing recommendation AFTER ensuring user has movie record
      const existingRecommendation = await this.getExistingRecommendation(normalizedMovie, context.userId);
      if (existingRecommendation) {
        this.log('EXISTING_RECOMMENDATION_FOUND', 'SUCCESS', {
          recommendationId: existingRecommendation.id,
          worthWatching: existingRecommendation.worth_watching
        });
        // Create brief chat message - recommendation details will appear below the image
        const chatMessage = `Here's my detailed recommendation for "${normalizedMovie.title}" (${normalizedMovie.year}).`;
        
        const finalResponse = {
          message: chatMessage,
          movie: normalizedMovie,
          recommendation: {
            id: existingRecommendation.id,
            movie_id: normalizedMovie.id,
            recommendation: existingRecommendation.recommendation,
            worth_watching: existingRecommendation.worth_watching,
            created_at: existingRecommendation.created_at
          },
          logs: this.logs,
          conversation: {
            turnCount: conversation.turnCount + 1,
            totalTokens: conversation.totalTokens // No new tokens used for existing recommendations
          }
        };
        
        // Save assistant message without movie data to avoid token usage
        await this.saveAssistantMessage(context.conversationId, chatMessage, normalizedMovie, context.userId);
        
        this.log('PROCESS_QUERY', 'SUCCESS', {
          movieTitle: normalizedMovie.title,
          totalSteps: this.logs.length,
          totalTokensUsed: this.logs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0),
          hasMovieData: !!finalResponse.movie,
          hasRecommendationData: !!finalResponse.recommendation,
          finalResponseStructure: {
            message: !!finalResponse.message,
            movie: !!finalResponse.movie,
            recommendation: !!finalResponse.recommendation,
            logs: !!finalResponse.logs,
            conversation: !!finalResponse.conversation
          }
        });

        return finalResponse;
      }

      // Step 10: Generate new recommendation using LangChain
      const recommendation = await this.generateRecommendation(normalizedMovie, context.conversationId);
      this.log('RECOMMENDATION_GENERATION', 'SUCCESS', {
        recommendationLength: recommendation.recommendation.length,
        worthWatching: recommendation.worth_watching,
        tokensUsed: recommendation.tokensUsed
      }, recommendation.tokensUsed);

      // Step 11: Save recommendation to database if user is logged in and movie record exists
      if (context.userId && normalizedMovie.id) {
        const { error: recError } = await this.supabase
          .from("recommendations")
          .insert({
            movie_id: normalizedMovie.id,
            recommendation: recommendation.recommendation,
            worth_watching: recommendation.worth_watching,
          });

        if (recError) {
          this.log('RECOMMENDATION_SAVE', 'ERROR', 'Failed to save recommendation', undefined, recError.message);
        } else {
          this.log('RECOMMENDATION_SAVE', 'SUCCESS', 'Recommendation saved successfully');
        }
      } else {
        this.log('RECOMMENDATION_SAVE', 'SKIP', 'No user ID or movie ID - guest user or missing data');
      }      // Step 12: Create appropriate chat message (not duplicating recommendation content)
      const currentConversation = this.conversationStore.get(context.conversationId);
      
      // Check if this is a repeated request or clarification
      const isRepeatedMovie = currentConversation?.discussedMovies.some(m => 
        m.title.toLowerCase() === normalizedMovie.title.toLowerCase()
      );
      
      // Create a brief, natural chat response - recommendation details will appear below the image
      let assistantMessage = "";
      if (isRepeatedMovie) {
        assistantMessage = `Here's the detailed recommendation for "${normalizedMovie.title}" again.`;
      } else {
        assistantMessage = `Great choice! Here's my detailed take on "${normalizedMovie.title}" (${normalizedMovie.year}).`;
      }
      
      await this.saveAssistantMessage(context.conversationId, assistantMessage, normalizedMovie, context.userId);
      this.log('ASSISTANT_MESSAGE_SAVE', 'SUCCESS', 'Complete chat response saved to conversation');

      // Step 13: Prepare final response with complete movie and recommendation data
      const finalResponse = {
        message: assistantMessage,
        movie: normalizedMovie,
        recommendation: {
          id: recommendation.id,
          movie_id: normalizedMovie.id,
          recommendation: recommendation.recommendation,
          worth_watching: recommendation.worth_watching,
          created_at: recommendation.created_at
        },
        logs: this.logs,
        conversation: {
          turnCount: conversation.turnCount + 1,
          totalTokens: conversation.totalTokens + (recommendation.tokensUsed || 0)
        }
      };      this.log('PROCESS_QUERY', 'SUCCESS', {
        movieTitle: normalizedMovie.title,
        totalSteps: this.logs.length,
        totalTokensUsed: this.logs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0),
        hasMovieData: !!finalResponse.movie,
        hasRecommendationData: !!finalResponse.recommendation,
        finalResponseStructure: {
          message: !!finalResponse.message,
          movie: !!finalResponse.movie,
          recommendation: !!finalResponse.recommendation,
          logs: !!finalResponse.logs,
          conversation: !!finalResponse.conversation
        }
      });

      console.log('Final response being returned:', {
        message: finalResponse.message,
        hasMovie: !!finalResponse.movie,
        hasRecommendation: !!finalResponse.recommendation,
        movieTitle: finalResponse.movie?.title,
        recommendationText: finalResponse.recommendation?.recommendation?.substring(0, 100) + '...'
      });

      return finalResponse;

    } catch (error: any) {
      this.log('PROCESS_QUERY', 'ERROR', 'Unexpected error in processQuery', undefined, error.message);
      return {
        error: "An error occurred while processing your request. Please try again.",
        logs: this.logs
      };
    }
  }

  private async loadConversation(conversationId: string): Promise<ConversationMemory> {
    this.log('LOAD_CONVERSATION', 'START', { conversationId });

    // Check memory store first
    let conversation = this.conversationStore.get(conversationId);
    if (conversation) {
      this.log('LOAD_CONVERSATION', 'SUCCESS', 'Loaded from memory store');
      return conversation;
    }

    // Try to load from database
    try {
      const { data, error } = await this.supabase
        .from('conversations')
        .select('*')
        .eq('conversation_id', conversationId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        this.log('LOAD_CONVERSATION', 'ERROR', 'Database error', undefined, error.message);
      }

      if (data) {
        conversation = {
          messages: data.messages || [],
          discussedMovies: data.discussed_movies || [],
          userPreferences: data.user_preferences || { genres: [], lastContext: "" },
          totalTokens: data.total_tokens || 0,
          turnCount: data.turns || 0
        };
        this.conversationStore.set(conversationId, conversation);
        this.log('LOAD_CONVERSATION', 'SUCCESS', 'Loaded from database');
        return conversation;
      }
    } catch (error: any) {
      this.log('LOAD_CONVERSATION', 'ERROR', 'Failed to load from database', undefined, error.message);
    }

    // Create new conversation
    conversation = {
      messages: [],
      discussedMovies: [],
      userPreferences: { genres: [], lastContext: "" },
      totalTokens: 0,
      turnCount: 0
    };
    this.conversationStore.set(conversationId, conversation);
    this.log('LOAD_CONVERSATION', 'SUCCESS', 'Created new conversation');
    return conversation;
  }

  private async saveUserMessage(conversationId: string, message: string): Promise<void> {
    this.log('SAVE_USER_MESSAGE', 'START', { conversationId, messageLength: message.length });

    const conversation = this.conversationStore.get(conversationId);
    if (!conversation) {
      this.log('SAVE_USER_MESSAGE', 'ERROR', 'Conversation not found in store');
      return;
    }

    conversation.messages.push({
      role: 'user',
      content: message,
      timestamp: Date.now()
    });

    // Keep only last 10 messages
    if (conversation.messages.length > 10) {
      conversation.messages = conversation.messages.slice(-10);
    }

    conversation.turnCount++;
    this.conversationStore.set(conversationId, conversation);
    this.log('SAVE_USER_MESSAGE', 'SUCCESS', { turnCount: conversation.turnCount });
  }

  private async saveAssistantMessage(conversationId: string, message: string, movieData?: any, userId?: string | null): Promise<void> {
    this.log('SAVE_ASSISTANT_MESSAGE', 'START', { conversationId, messageLength: message.length });

    const conversation = this.conversationStore.get(conversationId);
    if (!conversation) {
      this.log('SAVE_ASSISTANT_MESSAGE', 'ERROR', 'Conversation not found in store');
      return;
    }

    conversation.messages.push({
      role: 'assistant',
      content: message,
      timestamp: Date.now()
    });

    // Add movie to discussed list if provided
    if (movieData) {
      // Extract genre information from various possible sources
      let genre = movieData.genre || movieData.Genre || movieData.genres;
      if (Array.isArray(genre)) {
        genre = genre[0]; // Take first genre if it's an array
      }
      if (typeof genre === 'string' && genre.includes(',')) {
        genre = genre.split(',')[0].trim(); // Take first genre if comma-separated
      }
      
      const movieEntry = {
        title: movieData.title || movieData.Title,
        genre: genre || 'Unknown',
        rating: movieData.imdbRating || movieData.imdbRating || 'N/A'
      };
      conversation.discussedMovies.push(movieEntry);

      // Keep only last 5 movies
      if (conversation.discussedMovies.length > 5) {
        conversation.discussedMovies = conversation.discussedMovies.slice(-5);
      }

      // Update user preferences
      if (genre && genre !== 'Unknown' && !conversation.userPreferences.genres.includes(genre)) {
        conversation.userPreferences.genres.push(genre);
        if (conversation.userPreferences.genres.length > 3) {
          conversation.userPreferences.genres = conversation.userPreferences.genres.slice(-3);
        }
      }
    }    this.conversationStore.set(conversationId, conversation);
    
    // Save to database
    await this.saveConversationToDatabase(conversationId, conversation, userId);
    this.log('SAVE_ASSISTANT_MESSAGE', 'SUCCESS', { 
      discussedMoviesCount: conversation.discussedMovies.length,
      userGenres: conversation.userPreferences.genres
    });
  }
  private async saveConversationToDatabase(conversationId: string, conversation: ConversationMemory, userId?: string | null): Promise<void> {
    this.log('SAVE_CONVERSATION_DB', 'START', { conversationId });

    try {
      const { error } = await this.supabase
        .from('conversations')
        .upsert({
          conversation_id: conversationId,
          user_id: userId || null, // Now properly save the user_id
          turns: conversation.turnCount,
          total_tokens: conversation.totalTokens,
          last_activity: new Date().toISOString(),
          messages: conversation.messages,
          discussed_movies: conversation.discussedMovies,
          user_preferences: conversation.userPreferences,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'conversation_id'
        });

      if (error) {
        this.log('SAVE_CONVERSATION_DB', 'ERROR', 'Database save failed', undefined, error.message);
      } else {
        this.log('SAVE_CONVERSATION_DB', 'SUCCESS', 'Conversation saved to database');
      }
    } catch (error: any) {
      this.log('SAVE_CONVERSATION_DB', 'ERROR', 'Exception during save', undefined, error.message);
    }
  }  private async detectGeneralConversation(query: string): Promise<boolean> {
    this.log('DETECT_GENERAL_CONVERSATION', 'START', { query });

    const generalPatterns = [
      /^(hi|hello|hey|thanks|thank you|ok|okay|cool|nice|great|awesome)$/i,
      /^(what do you think|any other|anything else|what about|how about)/i,
      /^(tell me more|more info|details|explain)/i,
      /^(recommend|suggest|any recommendations|what should i watch)/i, // General recommendations
      /^(give me|show me|find me)\s+(some|any)?\s*(recommendations|suggestions)/i,
      /^(suggest|recommend)\s+(a|an|some)?\s*(good|great|best|slow\s+burn|action|thriller|drama|comedy|horror|sci-fi|romance|mystery)\s*(movie|film)/i, // Specific genre requests
      /^(suggest|recommend)\s+(a|an|some)?\s*(slow\s+burn|underrated|hidden\s+gem|classic|recent|new|old)\s*(movie|film)?/i, // Quality/style requests
      /^(any\s+good|what\s+are\s+some\s+good|can\s+you\s+suggest|what\s+about\s+some)\s*(slow\s+burn|action|thriller|drama|comedy|horror|sci-fi|romance|mystery)?\s*(movies|films)/i,
    ];

    // CRITICAL FIX: Comparison and contextual questions should be general conversation
    const comparisonPatterns = [
      /^(which one is better|which is better|what's better|whats better)/i,
      /^(yes|yeah|yep|sure|no|nope|not really|maybe)$/i, // Simple yes/no responses
      /^(so this is better|is this better|better than)/i,
      /^(which one|which movie|what about)/i,
      /^(compare|comparison|vs|versus)/i,
      /^(what do you think about|your opinion|do you prefer)/i,
      /^(recommend|suggest)\s+(similar|something similar|more like)/i, // "recommend similar" 
      /^(can you recommend|could you recommend|please recommend)\s+(similar|something)/i, // "can you recommend similar"
      /^[a-zA-Z\s'"-]+\s+or\s+[a-zA-Z\s'"-]+\??$/i, // "Movie A or Movie B" pattern with optional question mark
      /^(that one|this one|the first one|the second one|that movie|this movie)/i, // Contextual references
      /^(more about|tell me more about|what else about)/i, // Follow-up questions about discussed topics
      /\b(forrest\s+gump|the\s+pianist)\s+or\s+\b/i, // Specific movie comparisons
      /which\s+is\s+better.*(forrest\s+gump|the\s+pianist)/i, // "which is better" with movie names
    ];

    // Recommendation requests without specific movie context should be general conversation
    const recommendationPatterns = [
      /^(recommend|suggest|any recommendations|what should i watch)(?!\s+similar|\s+like)/i,
      /^(recommend something|suggest something|any good movies|something different|better movie)$/i,
      /^(give me|show me|find me)\s+(a|some|any)?\s*(good|better|different)?\s*(movie|film)/i,
      /^(can you recommend|could you recommend|please recommend)\s*(similar|something|a movie)/i, // "can you recommend similar movie"
      /^(recommend|suggest)\s+(similar|something similar)\s*(movie|film)?/i, // "recommend similar" or "suggest similar movie"
      /^(suggest|recommend)\s+(a|an|some)?\s*(good|great|best|slow\s+burn|action|thriller|drama|comedy|horror|sci-fi|romance|mystery)\s*(movie|film)/i, // Genre-specific requests
      /^(suggest|recommend)\s+(a|an|some)?\s*(slow\s+burn|underrated|hidden\s+gem|classic|recent|new|old)\s*(movie|film)?/i, // Style/quality requests
      /^(any\s+good|what\s+are\s+some\s+good|can\s+you\s+suggest|what\s+about\s+some)\s*(slow\s+burn|action|thriller|drama|comedy|horror|sci-fi|romance|mystery)?\s*(movies|films)/i,
      /^(what\s+about|how\s+about)\s+(a|an|some)?\s*(good|slow\s+burn|action|thriller|drama|comedy)?\s*(movie|film)/i, // "what about a good movie"
    ];    // Movie-specific queries that should trigger movie search
    const movieQueryPatterns = [
      /^(how is|how was|how's|hows)\s+[a-zA-Z]/i, // "how is 28 days later"
      /^(what about|tell me about|about)\s+[a-zA-Z][a-zA-Z\s:'-]+$/i, // "what about Batman" - but NOT "what about a good movie"
      /^(give recommendation for|review)\s+[a-zA-Z]/i, // "give recommendation for 28 days later"
      /^[a-zA-Z][a-zA-Z\s:'-]+$/i, // Direct movie titles like "28 days later"
      /(movie|film)\s+[a-zA-Z]/i, // Any mention of specific movies
      /[a-zA-Z]+\s+(movie|film)$/i, // "Batman movie"
    ];

    // Don't treat these as general conversation - they're movie-related but need movie search
    const movieContextPatterns = [
      /^(no|nope|not that|different|wrong|another)\s+[a-zA-Z]/i, // "no the korean movie" but not just "no"
      /(recent|latest|newer|new one|newest)\s+[a-zA-Z]/i, // "recent mission impossible" but not just "recent"
      /(original|first|older|classic)\s+[a-zA-Z]/i, // "original batman" but not just "original"
      /(that movie|that film|this movie|this film)/i,
      /(for .+|about .+)/i, // "for zodiac", "about batman"
      /(korean|japanese|french|italian|spanish|chinese).*(movie|film)/i,
      /(movie|film).*(korean|japanese|french|italian|spanish|chinese)/i,
      /20\d{2}/, // Year mentions
      /goosebumps.*movie/i,
      /movie.*goosebumps/i,
      /(sequel|its sequel|part 2|part ii|part two)\s+[a-zA-Z]/i, // "sequel to batman" but not just "sequel"
      /^[A-Z][a-zA-Z\s:'-]+\s+(19\d{2}|20\d{2})$/i, // "Superman 1978" - direct movie + year
      /^(it's|its)\s+(part\s+two|part\s+2|part\s+ii|sequel)/i, // "It's part two", "Its sequel"
      /(part\s+two|part\s+2|part\s+ii)$/i, // Direct "part two" mentions
      /(glass\s+onion|onion\s+glass)/i // Specific mentions of Glass Onion
    ];

    // Check for movie-specific queries first
    const isMovieQuery = movieQueryPatterns.some(pattern => pattern.test(query.trim()));
    if (isMovieQuery) {
      this.log('DETECT_GENERAL_CONVERSATION', 'SUCCESS', { 
        isGeneral: false, 
        reason: 'movie_query_detected',
        matchedPattern: movieQueryPatterns.find(p => p.test(query.trim()))?.source || 'movie_query'
      });
      return false;
    }

    const isGeneral = generalPatterns.some(pattern => pattern.test(query.trim()));
    const isComparison = comparisonPatterns.some(pattern => pattern.test(query.trim()));
    const isRecommendationRequest = recommendationPatterns.some(pattern => pattern.test(query.trim()));
    const isMovieContext = movieContextPatterns.some(pattern => pattern.test(query.trim()));
    const isShort = query.trim().length < 50;
    const hasMovieKeywords = this.containsMovieKeywords(query);
    
    // Special handling for contextual queries - "yep", "yes" after movie discussion should be general
    const isContextualResponse = /^(yes|yeah|yep|sure|no|nope)$/i.test(query.trim());
    
    // Movie title detection - if query contains common movie title patterns
    const hasMovieTitlePattern = /^[A-Z][a-z\s:'-]+(\s\d{4})?$/i.test(query.trim()) && query.trim().length > 3;
    
    // CRITICAL: Comparison requests should ALWAYS be general conversation
    if (isComparison) {
      this.log('DETECT_GENERAL_CONVERSATION', 'SUCCESS', { 
        isGeneral: true, 
        reason: 'comparison_request',
        isComparison: true,
        matchedPattern: comparisonPatterns.find(p => p.test(query.trim()))?.source || 'comparison'
      });
      return true;
    }
    
    // Simple contextual responses should be general conversation
    if (isContextualResponse) {
      this.log('DETECT_GENERAL_CONVERSATION', 'SUCCESS', { 
        isGeneral: true, 
        reason: 'contextual_response',
        isContextualResponse: true
      });
      return true;
    }
    
    // Recommendation requests without context should be handled by general conversation
    if (isRecommendationRequest && !isMovieContext) {
      this.log('DETECT_GENERAL_CONVERSATION', 'SUCCESS', { 
        isGeneral: true, 
        reason: 'general_recommendation_request',
        isRecommendationRequest,
        isMovieContext: false
      });
      return true;
    }
    
    // If it matches movie context patterns, treat as movie query
    if ((isMovieContext || hasMovieTitlePattern) && !isComparison && !isContextualResponse) {
      this.log('DETECT_GENERAL_CONVERSATION', 'SUCCESS', { 
        isGeneral: false, 
        reason: 'movie_context_detected',
        isMovieContext,
        hasMovieKeywords,
        hasMovieTitlePattern,
        matchedPattern: movieContextPatterns.find(p => p.test(query.trim()))?.source || 'movie_title_pattern'
      });
      return false;
    }
    
    const result = isGeneral || isComparison || isContextualResponse || (isShort && !hasMovieKeywords && !hasMovieTitlePattern && !isMovieQuery);

    this.log('DETECT_GENERAL_CONVERSATION', 'SUCCESS', { 
      isGeneral, 
      isShort, 
      result,
      hasMovieKeywords,
      isContextualResponse,
      isComparison,
      hasMovieTitlePattern,
      isMovieQuery,
      matchedPattern: generalPatterns.find(p => p.test(query.trim()))?.source || 'none'
    });

    return result;
  }

  private containsMovieKeywords(query: string): boolean {
    const movieKeywords = [
      'movie', 'film', 'watch', 'seen', 'director', 'actor', 'actress',
      'rating', 'imdb', 'review', 'plot', 'genre', 'cast', 'trailer'
    ];
    
    const lowerQuery = query.toLowerCase();
    return movieKeywords.some(keyword => lowerQuery.includes(keyword));
  }  private async handleGeneralConversation(context: ChainContext): Promise<any> {
    this.log('HANDLE_GENERAL_CONVERSATION', 'START', { query: context.query });

    try {
      // Load conversation memory into LangChain
      const conversation = this.conversationStore.get(context.conversationId);
      const isNewConversation = !conversation || conversation.messages.length <= 1; // Only the current user message
      
      // Only rebuild memory if it's empty or has fewer messages than our conversation
      const currentMemorySize = await this.memory.chatHistory.getMessages();
      const shouldRebuildMemory = currentMemorySize.length === 0 || 
        (conversation && conversation.messages.length > currentMemorySize.length + 1);
          
      if (shouldRebuildMemory && conversation && conversation.messages.length > 1) {
        await this.memory.clear();
        
        // Load previous messages but exclude the current user message (last one)
        const previousMessages = conversation.messages.slice(0, -1).slice(-8); // Last 8 messages for context
        for (const msg of previousMessages) {
          if (msg.role === 'user') {
            await this.memory.chatHistory.addUserMessage(msg.content);
          } else {
            await this.memory.chatHistory.addAIChatMessage(msg.content);
          }
        }
        
        // Add context about discussed movies to help with recommendations
        if (conversation.discussedMovies.length > 0) {
          const recentMovies = conversation.discussedMovies.slice(-3); // Last 3 movies
          const contextMessage = `Context: Recently discussed movies: ${recentMovies.map(m => `"${m.title}" (${m.genre || 'Unknown'}, ${m.rating || 'N/A'}/10)`).join(', ')}`;
          await this.memory.chatHistory.addAIChatMessage(contextMessage);
        }
        
        this.log('MEMORY_REBUILD', 'SUCCESS', { 
          messagesLoaded: previousMessages.length,
          shouldRebuildMemory,
          currentMemorySize: currentMemorySize.length,
          moviesInContext: conversation?.discussedMovies.length || 0
        });
      }

      // Generate response using conversation chain
      const response = await this.conversationChain.call({
        input: context.query
      });

      const tokensUsed = response.llmOutput?.tokenUsage?.totalTokens || 0;
      let responseText = response.response?.trim() || "I'm here to help you discover great movies! What film interests you?";

      // For new conversations with general greetings, provide a welcoming response
      if (isNewConversation && this.isGeneralGreeting(context.query)) {
        responseText = "Hello! I'm your movie advisor. What film has caught your interest today?";
      }

      // Debug logging for conversation state
      this.log('CONVERSATION_DEBUG', 'SUCCESS', {
        query: context.query,
        discussedMovies: conversation?.discussedMovies || [],
        memoryMessages: currentMemorySize.length,
        generatedResponse: responseText.substring(0, 100) + '...'
      });

      // Update token count
      if (conversation) {
        conversation.totalTokens += tokensUsed;
        this.conversationStore.set(context.conversationId, conversation);
      }

      // Save assistant response
      await this.saveAssistantMessage(context.conversationId, responseText, undefined, context.userId);      this.log('HANDLE_GENERAL_CONVERSATION', 'SUCCESS', {
        responseLength: responseText.length,
        tokensUsed,
        isNewConversation,
        memoryMessagesCount: currentMemorySize.length,
        conversationLength: conversation?.messages.length || 0
      }, tokensUsed);

      return {
        message: responseText,
        logs: this.logs,
        conversation: {
          turnCount: conversation?.turnCount || 1,
          totalTokens: conversation?.totalTokens || tokensUsed
        }
      };

    } catch (error: any) {
      this.log('HANDLE_GENERAL_CONVERSATION', 'ERROR', 'Failed to generate response', undefined, error.message);
      const fallbackResponse = "I'm here to help you discover great movies! What film interests you?";
      await this.saveAssistantMessage(context.conversationId, fallbackResponse, undefined, context.userId);
      return { message: fallbackResponse, logs: this.logs };
    }
  }

  private async extractMovieTitles(query: string, conversationId: string): Promise<string[]> {
    this.log('EXTRACT_MOVIE_TITLES', 'START', { query, conversationId });

    // Check for direct movie queries with year/actor first - bypass contextual handling
    const directMovieWithSpecifics = /^(ace|mean\s+girls|[a-zA-Z][a-zA-Z\s:'-]*)\s+(19\d{2}|20\d{2}|with\s+[a-zA-Z\s]+)$/i.test(query.trim());
    if (directMovieWithSpecifics) {
      this.log('EXTRACT_MOVIE_TITLES', 'SUCCESS', { 
        source: 'direct_bypass', 
        titles: [query.trim()],
        reason: 'Direct movie query with year/actor - bypassing contextual handling'
      });
      return [query.trim()];
    }

    // First check for contextual queries
    const contextualTitle = await this.handleContextualQueries(query, conversationId);
    if (contextualTitle) {
      this.log('EXTRACT_MOVIE_TITLES', 'SUCCESS', { source: 'contextual', titles: [contextualTitle] });
      return [contextualTitle];
    }

    // Build conversation context for LangChain
    const conversation = this.conversationStore.get(conversationId);
    let conversationContext = "";
    
    if (conversation && conversation.messages.length > 0) {
      const recentMessages = conversation.messages.slice(-4);
      conversationContext = recentMessages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');
      
      if (conversation.discussedMovies.length > 0) {
        const recentMovies = conversation.discussedMovies.slice(-2);
        conversationContext += '\n\nRecently discussed: ' + 
          recentMovies.map(m => `${m.title} (${m.genre || 'Unknown'})`).join(', ');
      }
    }    try {
      // Use LangChain for intelligent title extraction
      const result = await this.titleExtractionChain.invoke({
        context: conversationContext,
        query: query
      });

      const tokensUsed = result.llmOutput?.tokenUsage?.totalTokens || 0;
      const extractedTitle = result.text?.trim();
      
      // Check for special response types that shouldn't be treated as movie titles
      if (extractedTitle === 'COMPARISON_QUESTION' || 
          extractedTitle === 'SIMPLE_RESPONSE' || 
          extractedTitle === 'PREFERENCE_QUESTION' ||
          extractedTitle === 'GENERAL_RECOMMENDATION' ||
          extractedTitle === 'SIMILAR_RECOMMENDATION' ||
          extractedTitle === 'FOLLOW_UP_QUESTION') {
        this.log('EXTRACT_MOVIE_TITLES', 'SKIP', { 
          source: 'langchain', 
          responseType: extractedTitle,
          reason: 'Not a movie search query'
        });
        
        // Update conversation token count
        if (conversation) {
          conversation.totalTokens += tokensUsed;
          this.conversationStore.set(conversationId, conversation);
        }
        
        return []; // Return empty array to trigger general conversation
      }
      
      if (extractedTitle && extractedTitle.length > 0 && extractedTitle !== 'N/A') {
        this.log('EXTRACT_MOVIE_TITLES', 'SUCCESS', { 
          source: 'langchain', 
          titles: [extractedTitle],
          tokensUsed 
        }, tokensUsed);
        
        // Update conversation token count
        if (conversation) {
          conversation.totalTokens += tokensUsed;
          this.conversationStore.set(conversationId, conversation);
        }
        
        return [extractedTitle];
      }
    } catch (error: any) {
      this.log('EXTRACT_MOVIE_TITLES', 'ERROR', 'LangChain extraction failed', undefined, error.message);
    }

    // Fallback to regex extraction
    const regexTitles = this.extractTitlesWithRegex(query);
    this.log('EXTRACT_MOVIE_TITLES', regexTitles.length > 0 ? 'SUCCESS' : 'ERROR', { 
      source: 'regex', 
      titles: regexTitles 
    });

    return regexTitles;
  }  private async handleContextualQueries(query: string, conversationId: string): Promise<string | null> {
    this.log('HANDLE_CONTEXTUAL_QUERIES', 'START', { query, conversationId });

    const conversation = this.conversationStore.get(conversationId);
    if (!conversation || conversation.discussedMovies.length === 0) {
      this.log('HANDLE_CONTEXTUAL_QUERIES', 'SKIP', 'No conversation history');
      return null;
    }

    const lowerQuery = query.toLowerCase().trim();
    const lastMovie = conversation.discussedMovies[conversation.discussedMovies.length - 1];
    const previousMovies = conversation.discussedMovies.slice(0, -1);

    // Check if user mentioned a specific movie directly (e.g., "Wonder Woman 1984")
    const directMoviePattern = /([a-zA-Z][a-zA-Z\s:'-]+(?:\s+\d{4}|\s+1984|\s+returns|\s+rises|\s+begins))/i;
    const directMatch = query.match(directMoviePattern);
    if (directMatch && directMatch[1].length > 3) {
      const potentialTitle = directMatch[1].trim();
      // If it's a different movie than the last one discussed, return it
      if (potentialTitle.toLowerCase() !== lastMovie.title.toLowerCase()) {
        this.log('HANDLE_CONTEXTUAL_QUERIES', 'SUCCESS', { 
          type: 'direct_movie_specification', 
          extractedTitle: potentialTitle,
          lastMovie: lastMovie.title
        });
        return potentialTitle;
      }
    }

    // Extract base title more intelligently
    const getBaseTitle = (title: string): string => {
      return title
        .replace(/\s*\(\d{4}\)/, '') // Remove (year)
        .replace(/:\s*.+$/, '') // Remove subtitle after colon
        .replace(/\s*-\s*.+$/, '') // Remove subtitle after dash
        .replace(/\s*part\s+\d+/i, '') // Remove "Part X"
        .replace(/\s*\d+$/, '') // Remove trailing numbers
        .trim();
    };    // Enhanced contextual patterns with better sequel detection
    const contextualPatterns = [
      // Direct references to previous movie
      { patterns: ['that movie', 'that film', 'it', 'this movie', 'this film'], context: 'direct_reference' },
      // Sequel requests - CRITICAL FIX - Make part/sequel detection more aggressive
      { patterns: ['sequel', 'its sequel', 'the sequel', 'follow up', 'next one', 'part 2', 'part ii', 'part two', 'second one', 'second part', 'it\'s part two', 'part two'], context: 'sequel' },
      // Question about sequels existing
      { patterns: ['any sequel', 'there any sequel', 'are there sequel', 'have sequel', 'sequels exist'], context: 'sequel_inquiry' },
      // Specific movie mentions that should trigger new search
      { patterns: ['glass onion', 'onion glass'], context: 'specific_movie_mention' },
      // Recommendation requests - these should NOT return the same movie
      { patterns: ['recommendation', 'recommend', 'suggest', 'similar', 'like that', 'different', 'another', 'else'], context: 'recommendation' },
      // Clarification/correction requests
      { patterns: ['no', 'not that', 'wrong', 'different', 'korean', 'korean movie', 'korean version'], context: 'clarification' },
      // Recent/latest requests
      { patterns: ['recent', 'latest', 'newer', 'new one', 'newest'], context: 'recent' },
      // Original requests  
      { patterns: ['original', 'first', 'older', 'classic'], context: 'original' },
      // Year-specific requests
      { patterns: ['2023', '2024', '2025', '1984'], context: 'year_specific' },
      // Country/language specific requests
      { patterns: ['korean', 'japanese', 'french', 'italian', 'spanish', 'chinese'], context: 'country_specific' },
      // Better/comparison requests
      { patterns: ['better', 'which is better', 'compare', 'vs', 'versus'], context: 'comparison' }
    ];

    // Check if query contains the movie name directly but asking for something different
    const movieTitleInQuery = lastMovie.title.toLowerCase();
    if (lowerQuery.includes(movieTitleInQuery)) {
      // If they're asking for something different, don't return the same movie
      if (lowerQuery.includes('different') || lowerQuery.includes('another') || lowerQuery.includes('else') || 
          lowerQuery.includes('sequel') || lowerQuery.includes('1984')) {
        this.log('HANDLE_CONTEXTUAL_QUERIES', 'SKIP', 'User wants different movie variant, not returning same');
        return null;
      }
      
      this.log('HANDLE_CONTEXTUAL_QUERIES', 'SUCCESS', { 
        type: 'direct_movie_mention', 
        movie: lastMovie.title,
        query: lowerQuery
      });
      return lastMovie.title;
    }    // Check for contextual patterns
    for (const { patterns, context } of contextualPatterns) {
      if (patterns.some(pattern => lowerQuery.includes(pattern))) {
        const baseTitle = getBaseTitle(lastMovie.title);
        
        if (context === 'specific_movie_mention') {
          // Handle specific movie mentions like "glass onion" or "onion glass"
          if (lowerQuery.includes('glass onion') || lowerQuery.includes('onion glass')) {
            this.log('HANDLE_CONTEXTUAL_QUERIES', 'SUCCESS', { 
              type: context, 
              originalMovie: lastMovie.title,
              returnedTitle: 'Glass Onion',
              reason: 'specific_glass_onion_mention'
            });
            return 'Glass Onion';
          }
          return null;
        }
        
        if (context === 'direct_reference') {
          // For direct references, use the exact last discussed movie
          this.log('HANDLE_CONTEXTUAL_QUERIES', 'SUCCESS', { 
            type: context, 
            originalMovie: lastMovie.title,
            returnedTitle: lastMovie.title
          });
          return lastMovie.title;
        } 
        
        if (context === 'recommendation' || context === 'comparison') {
          // For recommendations or comparisons, let the system search for similar movies
          this.log('HANDLE_CONTEXTUAL_QUERIES', 'SKIP', { 
            type: context, 
            reason: 'User wants recommendations/comparisons, not returning contextual movie',
            originalMovie: lastMovie.title
          });
          return null;
        }if (context === 'sequel' || context === 'sequel_inquiry') {
          // Enhanced sequel detection with comprehensive mapping
          const sequelMap: { [key: string]: string[] } = {
            'wonder woman': ['Wonder Woman 1984', 'Wonder Woman: 1984'],
            'sherlock holmes': ['Sherlock Holmes: A Game of Shadows'],
            'mission impossible': ['Mission: Impossible - Dead Reckoning Part One', 'Mission: Impossible - Fallout'],
            'top gun': ['Top Gun: Maverick'],
            'avatar': ['Avatar: The Way of Water'],
            'batman begins': ['The Dark Knight', 'The Dark Knight Rises'],
            'the dark knight': ['The Dark Knight Rises'],
            'batman': ['Batman Returns', 'Batman Forever', 'The Dark Knight'],
            'spider-man': ['Spider-Man 2', 'Spider-Man 3', 'Spider-Man: No Way Home'],
            'iron man': ['Iron Man 2', 'Iron Man 3'],
            'thor': ['Thor: The Dark World', 'Thor: Ragnarok', 'Thor: Love and Thunder'],
            'captain america': ['Captain America: The Winter Soldier', 'Captain America: Civil War'],
            'guardians of the galaxy': ['Guardians of the Galaxy Vol. 2', 'Guardians of the Galaxy Vol. 3'],
            'toy story': ['Toy Story 2', 'Toy Story 3', 'Toy Story 4'],
            'john wick': ['John Wick: Chapter 2', 'John Wick: Chapter 3', 'John Wick: Chapter 4'],
            'fast and furious': ['2 Fast 2 Furious', 'Fast & Furious', 'Fast Five', 'Fast X'],
            'the matrix': ['The Matrix Reloaded', 'The Matrix Revolutions', 'The Matrix Resurrections'],
            'terminator': ['Terminator 2: Judgment Day', 'Terminator 3: Rise of the Machines'],
            'alien': ['Aliens', 'Alien 3', 'Alien: Resurrection'],
            'star wars': ['The Empire Strikes Back', 'Return of the Jedi'],
            'back to the future': ['Back to the Future Part II', 'Back to the Future Part III'],
            'the godfather': ['The Godfather Part II', 'The Godfather Part III'],
            'knives out': ['Glass Onion: A Knives Out Mystery', 'Glass Onion']
          };
          
          const baseLower = baseTitle.toLowerCase();
          let foundSequel = null;
          
          // Try exact and partial matches for known franchises
          for (const [franchise, sequels] of Object.entries(sequelMap)) {
            if (baseLower === franchise || baseLower.includes(franchise) || franchise.includes(baseLower)) {
              // Find a sequel that hasn't been discussed yet
              const undiscussedSequel = sequels.find(sequel => 
                !previousMovies.some(prev => prev.title.toLowerCase() === sequel.toLowerCase()) &&
                lastMovie.title.toLowerCase() !== sequel.toLowerCase()
              );
              
              foundSequel = undiscussedSequel || sequels[0]; // First sequel if all discussed
              break;
            }
          }
          
          // Universal sequel handling for ANY movie not in the predefined list
          if (!foundSequel) {
            // Try common sequel patterns for ANY movie
            const universalSequelPatterns = [
              `${baseTitle} 2`,
              `${baseTitle} II`,
              `${baseTitle} Part 2`,
              `${baseTitle} Part II`,
              `${baseTitle}: Part Two`,
              `${baseTitle} Returns`,
              `${baseTitle} Rises`,
              `${baseTitle} Reloaded`,
              `${baseTitle} Revenge`,
              `${baseTitle} Strikes Back`,
              `${baseTitle} Forever`,
              `${lastMovie.title} 2` // Use full original title
            ];
            
            // For movies with years, try next year or common sequel years
            const yearMatch = lastMovie.title.match(/(\d{4})/);
            if (yearMatch) {
              const year = parseInt(yearMatch[1]);
              universalSequelPatterns.push(
                `${baseTitle} ${year + 1}`,
                `${baseTitle} ${year + 2}`,
                `${baseTitle} ${year + 3}`
              );
            }
            
            // Return the first universal pattern to search for
            foundSequel = universalSequelPatterns[0];
            
            this.log('HANDLE_CONTEXTUAL_QUERIES', 'SUCCESS', { 
              type: context, 
              originalMovie: lastMovie.title,
              baseTitle,
              foundSequel,
              method: 'universal_pattern',
              patterns: universalSequelPatterns.slice(0, 3) // Log first 3 patterns
            });
            return foundSequel;
          }
          
          if (foundSequel) {
            this.log('HANDLE_CONTEXTUAL_QUERIES', 'SUCCESS', { 
              type: context, 
              originalMovie: lastMovie.title,
              baseTitle,
              foundSequel,
              method: 'predefined_mapping',
              matchedFranchise: Object.keys(sequelMap).find(k => baseLower === k || baseLower.includes(k) || k.includes(baseLower))
            });
            return foundSequel;
          }
          
          // If no known sequel, return null to let general search handle it
          this.log('HANDLE_CONTEXTUAL_QUERIES', 'SKIP', { 
            type: context, 
            reason: 'No sequel pattern matched',
            originalMovie: lastMovie.title,
            baseTitle
          });
          return null;
        }
        
        if (context === 'clarification') {
          // Handle clarifications like "no the korean movie", "korean version"
          if (lowerQuery.includes('korean')) {
            const baseTitle = getBaseTitle(lastMovie.title);
            const contextualTitle = `${baseTitle} Korean`;
            this.log('HANDLE_CONTEXTUAL_QUERIES', 'SUCCESS', { 
              type: context, 
              originalMovie: lastMovie.title,
              returnedTitle: contextualTitle
            });
            return contextualTitle;
          } else if (lowerQuery.includes('different') || lowerQuery.includes('another')) {
            this.log('HANDLE_CONTEXTUAL_QUERIES', 'SKIP', 'User wants different movie');
            return null;
          } else {
            const contextualTitle = getBaseTitle(lastMovie.title);
            this.log('HANDLE_CONTEXTUAL_QUERIES', 'SUCCESS', { 
              type: context, 
              originalMovie: lastMovie.title,
              returnedTitle: contextualTitle
            });
            return contextualTitle;
          }
        } 
        
        if (context === 'country_specific') {
          const country = patterns.find(p => lowerQuery.includes(p));
          const baseTitle = getBaseTitle(lastMovie.title);
          const contextualTitle = `${baseTitle} ${country}`;
          this.log('HANDLE_CONTEXTUAL_QUERIES', 'SUCCESS', { 
            type: context, 
            originalMovie: lastMovie.title,
            returnedTitle: contextualTitle,
            country
          });
          return contextualTitle;
        } 
        
        if (context === 'recent') {
          const contextualTitle = baseTitle;
          this.log('HANDLE_CONTEXTUAL_QUERIES', 'SUCCESS', { 
            type: context, 
            originalMovie: lastMovie.title,
            returnedTitle: contextualTitle
          });
          return contextualTitle;
        } 
        
        if (context === 'year_specific') {
          const yearMatch = query.match(/\b(19\d{2}|20\d{2})\b/);
          if (yearMatch) {
            const contextualTitle = `${baseTitle} ${yearMatch[0]}`;
            this.log('HANDLE_CONTEXTUAL_QUERIES', 'SUCCESS', { 
              type: context, 
              originalMovie: lastMovie.title,
              returnedTitle: contextualTitle,
              extractedYear: yearMatch[0]
            });
            return contextualTitle;
          }
        }
      }
    }

    this.log('HANDLE_CONTEXTUAL_QUERIES', 'SKIP', 'No contextual patterns matched');
    return null;
  }  private extractTitlesWithRegex(query: string): string[] {
    this.log('EXTRACT_TITLES_REGEX', 'START', { query });

    // Handle direct movie + year/actor patterns first
    const directPatterns = [
      // Movie + year (e.g., "Ace 2025", "Mean Girls 2024")
      /^([a-zA-Z][a-zA-Z\s:'-]*?)\s+(19\d{2}|20\d{2})$/i,
      // Movie + "with" + actor (e.g., "Ace with Vijay Sethupathi")
      /^([a-zA-Z][a-zA-Z\s:'-]*?)\s+with\s+([a-zA-Z\s]+)$/i,
      // Movie + year + "with" + actor
      /^([a-zA-Z][a-zA-Z\s:'-]*?)\s+(19\d{2}|20\d{2})\s+with\s+([a-zA-Z\s]+)$/i,
    ];

    for (const pattern of directPatterns) {
      const match = query.trim().match(pattern);
      if (match) {
        this.log('EXTRACT_TITLES_REGEX', 'SUCCESS', { 
          pattern: 'direct_movie_year_actor', 
          titles: [query.trim()],
          matchedPattern: pattern.source
        });
        return [query.trim()];
      }
    }

    // Handle specific movie mentions
    const specificMentions: { [key: string]: string } = {
      'glass onion': 'Glass Onion',
      'onion glass': 'Glass Onion',
      'part two': 'part two',
      'part 2': 'part 2',
      'part ii': 'part ii'
    };

    const queryLower = query.toLowerCase().trim();
    for (const [mention, title] of Object.entries(specificMentions)) {
      if (queryLower.includes(mention)) {
        this.log('EXTRACT_TITLES_REGEX', 'SUCCESS', { 
          pattern: 'specific_mention', 
          titles: [title],
          detectedMention: mention 
        });
        return [title];
      }
    }

    // Try more general patterns
    const specificPatterns = [
      // "How is [movie]" pattern
      /^(?:how\s+is|how\s+was|how's|hows)\s+([a-zA-Z0-9\s&:'-]+?)(?:\s*\??)$/gi,
      // "Give recommendation for [movie]" pattern
      /^(?:give\s+recommendation\s+for|recommend|review)\s+([a-zA-Z0-9\s&:'-]+?)(?:\s*\??)$/gi,
      // "What about [movie]" pattern  
      /^(?:what\s+about|tell\s+me\s+about|about)\s+([a-zA-Z0-9\s&:'-]+?)(?:\s*\??)$/gi,
      // Movie + year patterns
      /\b([A-Z][a-zA-Z\s&:'-]*(?:\s+1984|\s+19\d{2}|\s+20\d{2}))\b/g,
      // Quoted movie titles
      /(?:movie|film)\s+["""]([^"""]+)["""]/gi,
      /["""]([^"""]+)["""](?:\s+(?:movie|film))?/gi,
      // Country-specific patterns
      /([a-zA-Z\s]+)\s+(korean|japanese|chinese|french|italian|spanish)\s*(?:movie|film)?/gi,
      /(korean|japanese|chinese|french|italian|spanish)\s+([a-zA-Z\s]+)(?:\s+movie|\s+film)?/gi
    ];

    for (const pattern of specificPatterns) {
      const matches = query.match(pattern);
      if (matches && matches.length > 0) {
        let titles = matches.map(match => {
          // Clean up the match
          let cleaned = match.replace(/["""]/g, '').trim();
          cleaned = cleaned.replace(/\b(movie|film)\b/gi, '').trim();
          
          // Handle country-specific patterns
          if (/(korean|japanese|chinese|french|italian|spanish)/i.test(cleaned)) {
            // Keep the country identifier for better search
            return cleaned;
          }
          
          return cleaned;
        }).filter(title => title.length > 2 && !this.isCommonWord(title));
        
        if (titles.length > 0) {
          this.log('EXTRACT_TITLES_REGEX', 'SUCCESS', { pattern: pattern.source, titles });
          return titles;
        }
      }
    }

    // Last resort: return the query as is, but clean it up
    let fallbackTitle = query.trim();
    fallbackTitle = fallbackTitle.replace(/\b(movie|film)\b/gi, '').trim();
    
    // Don't return common words or very short strings as movie titles
    if (this.isCommonWord(fallbackTitle) || fallbackTitle.length < 3) {
      this.log('EXTRACT_TITLES_REGEX', 'ERROR', { reason: 'fallback_too_short_or_common', fallback: fallbackTitle });
      return [];
    }
    
    this.log('EXTRACT_TITLES_REGEX', 'SUCCESS', { fallback: true, titles: [fallbackTitle] });
    return [fallbackTitle];
  }

  private isCommonWord(word: string): boolean {
    const commonWords = [
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'will', 'would', 'should', 'could',
      'yes', 'no', 'ok', 'okay', 'sure', 'yeah', 'yep', 'nope',
      'how', 'what', 'when', 'where', 'why', 'who', 'which',
      'sequel', 'sequels', 'recommendation', 'recommend', 'suggest',
      'better', 'good', 'bad', 'great', 'awesome', 'terrible',
      'recent', 'latest', 'new', 'old', 'classic', 'modern'
    ];
    
    return commonWords.includes(word.toLowerCase());
  }
  private async searchDatabase(titles: string[], userId: string | null): Promise<any> {
    this.log('SEARCH_DATABASE', 'START', { titles, userId: userId ? 'provided' : 'null' });

    if (!userId) {
      this.log('SEARCH_DATABASE', 'SKIP', 'No user ID provided');
      return null;
    }

    try {
      for (const title of titles) {
        // Exact match first (case-insensitive)
        const { data: exactMatch, error: exactError } = await this.supabase
          .from("movies")
          .select("*, recommendations(*)")
          .ilike("title", title) // Use ilike for case-insensitive exact match
          .eq("user_id", userId)
          .maybeSingle();

        if (exactError && exactError.code !== 'PGRST116') {
          this.log('SEARCH_DATABASE', 'ERROR', 'Exact match query failed', undefined, exactError.message);
        }

        if (exactMatch) {
          this.log('SEARCH_DATABASE', 'SUCCESS', { 
            matchType: 'exact_case_insensitive',
            movieId: exactMatch.id,
            title: exactMatch.title,
            searchedTitle: title,
            hasRecommendations: exactMatch.recommendations?.length > 0
          });
          return exactMatch;
        }

        // Fuzzy match with better patterns
        const searchPatterns = [
          `%${title}%`, // Original
          `%${title.replace(/:/g, '')}%`, // Remove colons
          `%${title.replace(/\s+/g, '%')}%`, // Replace spaces with wildcards
        ];

        for (const pattern of searchPatterns) {
          const { data: fuzzyMatches, error: fuzzyError } = await this.supabase
            .from("movies")
            .select("*, recommendations(*)")
            .ilike("title", pattern)
            .eq("user_id", userId)
            .limit(3); // Get multiple matches to find best one

          if (fuzzyError) {
            this.log('SEARCH_DATABASE', 'ERROR', 'Fuzzy match query failed', undefined, fuzzyError.message);
            continue;
          }

          if (fuzzyMatches && fuzzyMatches.length > 0) {
            // Find best match by calculating similarity
            const bestMatch = this.findBestTitleMatch(title, fuzzyMatches);
            
            this.log('SEARCH_DATABASE', 'SUCCESS', { 
              matchType: 'fuzzy',
              movieId: bestMatch.id,
              title: bestMatch.title,
              searchedTitle: title,
              pattern: pattern,
              hasRecommendations: bestMatch.recommendations?.length > 0
            });
            return bestMatch;
          }
        }
      }

      this.log('SEARCH_DATABASE', 'SUCCESS', { found: false, searchedTitles: titles });
      return null;

    } catch (error: any) {
      this.log('SEARCH_DATABASE', 'ERROR', 'Database search exception', undefined, error.message);
      return null;
    }
  }
  private findBestTitleMatch(searchTitle: string, movies: any[]): any {
    // Simple similarity scoring based on common words and length
    const normalize = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const searchNormalized = normalize(searchTitle);
    
    let bestMatch = movies[0];
    let bestScore = 0;
    
    for (const movie of movies) {
      const movieNormalized = normalize(movie.title);
      
      // Calculate similarity score
      const commonWords = searchNormalized.split(' ').filter(word => 
        movieNormalized.includes(word) && word.length > 2
      ).length;
      
      const lengthDiff = Math.abs(searchNormalized.length - movieNormalized.length);
      const score = commonWords * 10 - lengthDiff;
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = movie;
      }
    }
    
    this.log('TITLE_MATCH_SCORING', 'SUCCESS', {
      searchTitle,
      bestMatch: bestMatch.title,
      score: bestScore,
      totalOptions: movies.length
    });
    
    return bestMatch;
  }

  private async getExistingRecommendation(movieData: any, userId?: string | null): Promise<any | null> {
    this.log('GET_EXISTING_RECOMMENDATION', 'START', { 
      movieTitle: movieData.title,
      movieId: movieData.id,
      userId: userId ? 'provided' : 'null'
    });

    try {
      // If we have a userId, find the user's specific movie record first
      if (userId && movieData.imdbID) {
        // Find the user's specific movie record
        const { data: userMovie, error: movieError } = await this.supabase
          .from('movies')
          .select('id')
          .eq('user_id', userId)
          .eq('imdbid', movieData.imdbID || movieData.imdbid)
          .single();

        if (movieError && movieError.code !== 'PGRST116') {
          this.log('GET_EXISTING_RECOMMENDATION', 'ERROR', 'Failed to find user movie', undefined, movieError.message);
          return null;
        }

        if (userMovie) {
          // Check for recommendation on the user's movie record
          const { data: existingRec, error: recError } = await this.supabase
            .from('recommendations')
            .select('*')
            .eq('movie_id', userMovie.id)
            .single();

          if (recError && recError.code !== 'PGRST116') {
            this.log('GET_EXISTING_RECOMMENDATION', 'ERROR', 'Failed to find user recommendation', undefined, recError.message);
            return null;
          }

          if (existingRec) {
            this.log('GET_EXISTING_RECOMMENDATION', 'SUCCESS', { 
              found: true,
              recommendationId: existingRec.id,
              userMovieId: userMovie.id,
              worthWatching: existingRec.worth_watching
            });
            return existingRec;
          }
        }

        this.log('GET_EXISTING_RECOMMENDATION', 'SUCCESS', { 
          found: false, 
          reason: 'No user-specific movie or recommendation found' 
        });
        return null;
      }

      // Fallback to original behavior for backward compatibility
      const { data: existingRec, error } = await this.supabase
        .from('recommendations')
        .select('*')
        .eq('movie_id', movieData.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        this.log('GET_EXISTING_RECOMMENDATION', 'ERROR', 'Database query failed', undefined, error.message);
        return null;
      }

      if (existingRec) {
        this.log('GET_EXISTING_RECOMMENDATION', 'SUCCESS', { 
          found: true,
          recommendationId: existingRec.id,
          worthWatching: existingRec.worth_watching
        });
        return existingRec;
      }

      this.log('GET_EXISTING_RECOMMENDATION', 'SUCCESS', { found: false });
      return null;

    } catch (error: any) {
      this.log('GET_EXISTING_RECOMMENDATION', 'ERROR', 'Exception during lookup', undefined, error.message);
      return null;
    }
  }
  private async searchOMDB(titles: string[]): Promise<any> {
    this.log('SEARCH_OMDB', 'START', { titles });

    if (!this.omdbApiKey) {
      this.log('SEARCH_OMDB', 'ERROR', 'OMDB API key not available');
      return null;
    }

    for (const title of titles) {
      try {
        // Extract year and actor information from the title
        const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
        const actorMatch = title.match(/\b(with|starring)\s+([A-Za-z\s]+?)(?:\s|$)/i);
        const requestedYear = yearMatch ? yearMatch[1] : null;
        const requestedActor = actorMatch ? actorMatch[2].trim() : null;
        
        // Debug logging for year/actor extraction
        this.log('OMDB_TITLE_ANALYSIS', 'SUCCESS', {
          originalTitle: title,
          extractedYear: requestedYear,
          extractedActor: requestedActor,
          baseTitle: this.extractBaseTitle(title)
        });
        
        // For titles with specific year/actor requirements, prioritize them
        if (requestedYear || requestedActor) {
          this.log('OMDB_SPECIFIC_SEARCH', 'START', { 
            title, 
            requestedYear, 
            requestedActor 
          });
          
          // Try search API first for year/actor specific queries
          const baseTitle = this.extractBaseTitle(title);
          this.log('OMDB_BASE_TITLE_SEARCH', 'START', { 
            baseTitle,
            searchUrl: `https://www.omdbapi.com/?s=${encodeURIComponent(baseTitle)}&apikey=***`
          });
          
          const searchResponse = await fetch(
            `https://www.omdbapi.com/?s=${encodeURIComponent(baseTitle)}&apikey=${this.omdbApiKey}`
          );
          const searchData = await searchResponse.json();
          
          this.log('OMDB_SEARCH_RESPONSE', 'SUCCESS', {
            responseStatus: searchData.Response,
            totalResults: searchData.Search?.length || 0,
            searchError: searchData.Error || 'none'
          });
          
          if (searchData.Response === "True" && searchData.Search?.length > 0) {
            // Filter results based on year and actor requirements
            let filteredResults = searchData.Search;
            
            this.log('OMDB_BEFORE_FILTER', 'SUCCESS', {
              totalResults: searchData.Search.length,
              allYears: searchData.Search.map((m: any) => m.Year),
              requestedYear
            });
            
            if (requestedYear) {
              filteredResults = filteredResults.filter((movie: any) => 
                movie.Year === requestedYear || 
                Math.abs(parseInt(movie.Year) - parseInt(requestedYear)) <= 1 // Allow 1 year difference
              );
              this.log('OMDB_YEAR_FILTER', 'SUCCESS', { 
                requestedYear, 
                filteredCount: filteredResults.length,
                originalCount: searchData.Search.length 
              });
            }
            
            // If we have specific results, get the first one's details
            if (filteredResults.length > 0) {
              const targetMovie = filteredResults[0];
              
              // Get detailed data to check actor if specified
              const detailResponse = await fetch(
                `https://www.omdbapi.com/?i=${targetMovie.imdbID}&apikey=${this.omdbApiKey}`
              );
              const detailData = await detailResponse.json();
              
              if (detailData.Response === "True") {
                // Check if actor matches (if specified)
                if (requestedActor) {
                  const actors = detailData.Actors || '';
                  const actorNames = actors.split(',').map((name: string) => name.trim().toLowerCase());
                  const requestedActorLower = requestedActor.toLowerCase();
                  
                  const actorMatches = actorNames.some((actor: string) => 
                    actor.includes(requestedActorLower) || 
                    requestedActorLower.includes(actor) ||
                    this.fuzzyActorMatch(actor, requestedActorLower)
                  );
                  
                  if (!actorMatches) {
                    this.log('OMDB_ACTOR_MISMATCH', 'SKIP', { 
                      requestedActor, 
                      movieActors: actors,
                      movieTitle: detailData.Title,
                      movieYear: detailData.Year
                    });
                    continue; // Try next title if actor doesn't match
                  }
                  
                  this.log('OMDB_ACTOR_MATCH', 'SUCCESS', { 
                    requestedActor, 
                    movieActors: actors 
                  });
                }
                
                this.log('OMDB_SPECIFIC_SEARCH', 'SUCCESS', { 
                  title: detailData.Title,
                  year: detailData.Year,
                  actors: detailData.Actors,
                  matchedRequirements: { year: requestedYear, actor: requestedActor }
                });
                return detailData;
              }
            }
          }
        }

        // Fallback to exact match search
        this.log('OMDB_EXACT_SEARCH', 'START', { title });
        const exactResponse = await fetch(
          `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${this.omdbApiKey}`
        );
        const exactData = await exactResponse.json();
        
        if (exactData.Response === "True") {
          this.log('OMDB_EXACT_SEARCH', 'SUCCESS', { 
            title: exactData.Title,
            year: exactData.Year,
            imdbID: exactData.imdbID
          });
          return exactData;
        }

        this.log('OMDB_EXACT_SEARCH', 'SKIP', { reason: exactData.Error || 'Not found' });

        // For contextual titles, try variations
        const searchVariations = this.generateOMDBSearchVariations(title);
        
        for (const variation of searchVariations) {
          this.log('OMDB_VARIATION_SEARCH', 'START', { variation });
          
          const variationResponse = await fetch(
            `https://www.omdbapi.com/?t=${encodeURIComponent(variation)}&apikey=${this.omdbApiKey}`
          );
          const variationData = await variationResponse.json();
          
          if (variationData.Response === "True") {
            this.log('OMDB_VARIATION_SEARCH', 'SUCCESS', { 
              searchedVariation: variation,
              foundTitle: variationData.Title,
              year: variationData.Year
            });
            return variationData;
          }
        }

        // Try search API for broader results (only if not already tried above)
        if (!requestedYear && !requestedActor) {
          this.log('OMDB_SEARCH_API', 'START', { title });
          const searchResponse = await fetch(
            `https://www.omdbapi.com/?s=${encodeURIComponent(this.extractBaseTitle(title))}&apikey=${this.omdbApiKey}`
          );
          const searchData = await searchResponse.json();
          
          if (searchData.Response === "True" && searchData.Search?.length > 0) {
            // For recent requests, prioritize newer movies
            const sortedResults = this.sortOMDBResults(searchData.Search, title);
            const firstResult = sortedResults[0];
            
            this.log('OMDB_SEARCH_API', 'SUCCESS', { 
              foundResults: searchData.Search.length,
              firstResult: firstResult.Title,
              year: firstResult.Year
            });

            // Get detailed data
            this.log('OMDB_DETAIL_FETCH', 'START', { imdbID: firstResult.imdbID });
            const detailResponse = await fetch(
              `https://www.omdbapi.com/?i=${firstResult.imdbID}&apikey=${this.omdbApiKey}`
            );
            const detailData = await detailResponse.json();
            
            if (detailData.Response === "True") {
              this.log('OMDB_DETAIL_FETCH', 'SUCCESS', { 
                title: detailData.Title,
                year: detailData.Year,
                rating: detailData.imdbRating
              });
              return detailData;
            }

            this.log('OMDB_DETAIL_FETCH', 'ERROR', { reason: detailData.Error || 'Failed to get details' });
          } else {
            this.log('OMDB_SEARCH_API', 'SKIP', { reason: searchData.Error || 'No results' });
          }
        }

      } catch (error: any) {
        this.log('SEARCH_OMDB', 'ERROR', `Network error for title: ${title}`, undefined, error.message);
      }
    }

    this.log('SEARCH_OMDB', 'SUCCESS', { found: false, searchedTitles: titles });
    return null;
  }

  // Add fuzzy actor matching helper method
  private fuzzyActorMatch(actor1: string, actor2: string): boolean {
    // Simple fuzzy matching for actor names
    const normalize = (name: string) => name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    const norm1 = normalize(actor1);
    const norm2 = normalize(actor2);
    
    // Check if either name contains the other (for partial matches)
    return norm1.includes(norm2) || norm2.includes(norm1) ||
           this.calculateSimilarity(norm1, norm2) > 0.7;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.getEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private getEditDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private extractBaseTitle(title: string): string {
    // Extract base movie title for better OMDB searching
    return title
      .replace(/\s*\d{4}$/, '') // Remove year at end
      .replace(/\s*\(\d{4}\)/, '') // Remove (year)
      .replace(/:\s*.+$/, '') // Remove subtitle after colon
      .replace(/\s*-\s*.+$/, '') // Remove subtitle after dash
      .replace(/\s+with\s+.+$/i, '') // Remove "with [actor]"
      .replace(/\s+starring\s+.+$/i, '') // Remove "starring [actor]"
      .trim();
  }
  private generateOMDBSearchVariations(title: string): string[] {
    const variations: string[] = [];
    const baseTitle = this.extractBaseTitle(title);
    
    // Handle year-specific searches first
    const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
      const year = yearMatch[1];
      
      // For recent years (2020+), try the exact title with year first
      if (parseInt(year) >= 2020) {
        variations.push(`${baseTitle} ${year}`);
        variations.push(`${baseTitle} (${year})`);
      }
      
      // Special year handling
      if (year === '1984' && baseTitle.toLowerCase().includes('wonder woman')) {
        variations.push('Wonder Woman 1984', 'Wonder Woman: 1984');
      }
    }
    
    // Handle actor-specific searches
    const actorMatch = title.match(/\b(with|starring)\s+([A-Za-z\s]+?)(?:\s|$)/i);
    if (actorMatch) {
      const actor = actorMatch[2].trim();
      variations.push(`${baseTitle} ${actor}`);
      variations.push(`${baseTitle} starring ${actor}`);
    }
    
    // If original title contains a year, try without it
    if (/\d{4}/.test(title)) {
      variations.push(baseTitle);
    }
    
    // Handle country-specific searches
    if (/(korean|japanese|chinese|french|italian|spanish)/i.test(title)) {
      const country = title.match(/(korean|japanese|chinese|french|italian|spanish)/i)?.[1];
      const titleWithoutCountry = title.replace(/(korean|japanese|chinese|french|italian|spanish)/gi, '').trim();
      
      // For Korean "Taxi Driver", try known Korean movies
      if (country?.toLowerCase() === 'korean') {
        if (titleWithoutCountry.toLowerCase().includes('taxi driver')) {
          variations.push('A Taxi Driver', 'Taxi Driver 2017', 'Taeksi Woonjunsa');
        } else if (titleWithoutCountry.toLowerCase().includes('oldboy')) {
          variations.push('Oldboy', 'Oldboy 2003');
        } else if (titleWithoutCountry.toLowerCase().includes('parasite')) {
          variations.push('Parasite', 'Parasite 2019', 'Gisaengchung');
        }
        // Add the country as a search term
        variations.push(`${titleWithoutCountry} Korean`);
        variations.push(`${titleWithoutCountry} South Korea`);
      }
      
      // Add base title without country
      variations.push(titleWithoutCountry);
    }
      // For franchise movies, try latest known entries
    const franchiseMap: { [key: string]: string[] } = {
      'wonder woman': [
        'Wonder Woman 1984',
        'Wonder Woman: 1984'
      ],
      'mission impossible': [
        'Mission: Impossible - Dead Reckoning Part One',
        'Mission: Impossible - Fallout',
        'Mission: Impossible - Rogue Nation'
      ],
      'top gun': ['Top Gun: Maverick'],
      'batman': ['The Batman', 'The Dark Knight Rises', 'Batman Returns'],
      'spider-man': ['Spider-Man: No Way Home', 'Spider-Man: Far From Home', 'Spider-Man 2'],
      'fast': ['Fast X', 'Fast & Furious Presents: Hobbs & Shaw'],
      'john wick': ['John Wick: Chapter 4', 'John Wick: Chapter 3', 'John Wick: Chapter 2'],
      'avatar': ['Avatar: The Way of Water'],
      'iron man': ['Iron Man 2', 'Iron Man 3'],
      'thor': ['Thor: The Dark World', 'Thor: Ragnarok', 'Thor: Love and Thunder'],
      'captain america': ['Captain America: The Winter Soldier', 'Captain America: Civil War'],
      'guardians of the galaxy': ['Guardians of the Galaxy Vol. 2', 'Guardians of the Galaxy Vol. 3'],
      'toy story': ['Toy Story 2', 'Toy Story 3', 'Toy Story 4'],
      'the matrix': ['The Matrix Reloaded', 'The Matrix Revolutions', 'The Matrix Resurrections'],
      'terminator': ['Terminator 2: Judgment Day', 'Terminator 3: Rise of the Machines'],
      'alien': ['Aliens', 'Alien 3', 'Alien: Resurrection'],
      'star wars': ['The Empire Strikes Back', 'Return of the Jedi'],
      'back to the future': ['Back to the Future Part II', 'Back to the Future Part III'],
      'the godfather': ['The Godfather Part II', 'The Godfather Part III'],
      'taxi driver': ['Taxi Driver', 'A Taxi Driver'] // Handle both US and Korean versions
    };
    
    // Handle specific year patterns (like "Wonder Woman 1984")
    const yearPattern = /(\d{4})/;
    const franchiseYearMatch = title.match(yearPattern);
    if (franchiseYearMatch) {
      const year = franchiseYearMatch[1];
      // If it's "Wonder Woman 1984", search for that exact title
      if (year === '1984' && baseTitle.toLowerCase().includes('wonder woman')) {
        variations.push('Wonder Woman 1984', 'Wonder Woman: 1984');
      }
      // Add variation with year
      variations.push(`${baseTitle} ${year}`);
    }
      const baseLower = baseTitle.toLowerCase();
    let foundInFranchiseMap = false;
    
    // Check predefined franchise mappings first
    for (const [franchise, movies] of Object.entries(franchiseMap)) {
      if (baseLower.includes(franchise)) {
        variations.push(...movies);
        foundInFranchiseMap = true;
        break;
      }
    }
    
    // Universal sequel patterns for ANY movie not in predefined list
    if (!foundInFranchiseMap) {
      const universalVariations = [
        `${baseTitle} 2`,
        `${baseTitle} II`,
        `${baseTitle} Part 2`,
        `${baseTitle} Part II`,
        `${baseTitle}: Part Two`,
        `${baseTitle} Returns`,
        `${baseTitle} Rises`,
        `${baseTitle} Reloaded`,
        `${baseTitle} Forever`,
        `${baseTitle} Revenge`,
        `${baseTitle} Strikes Back`
      ];
      
      // Add year-based variations if original has a year
      if (yearMatch) {
        const year = parseInt(yearMatch[1]);
        const baseWithoutYear = baseTitle.replace(/\d{4}/, '').trim();
        universalVariations.push(
          `${baseWithoutYear} ${year + 1}`,
          `${baseWithoutYear} ${year + 2}`,
          `${baseWithoutYear} ${year + 3}`
        );
      }
      
      variations.push(...universalVariations.slice(0, 6)); // Add first 6 universal patterns
    }
    
    // Handle direct specific movie requests
    const specificMovieMappings: { [key: string]: string[] } = {
      'wonder woman 1984': ['Wonder Woman 1984', 'Wonder Woman: 1984'],
      'top gun maverick': ['Top Gun: Maverick'],
      'batman begins': ['Batman Begins'],
      'the dark knight': ['The Dark Knight'],
      'dark knight rises': ['The Dark Knight Rises'],
      'spider-man no way home': ['Spider-Man: No Way Home'],
      'mission impossible fallout': ['Mission: Impossible - Fallout'],
      'john wick 4': ['John Wick: Chapter 4'],
      'avatar 2': ['Avatar: The Way of Water']
    };
    
    for (const [key, mappings] of Object.entries(specificMovieMappings)) {
      if (title.toLowerCase().includes(key)) {
        variations.push(...mappings);
        break;
      }
    }
      this.log('OMDB_VARIATIONS_GENERATED', 'SUCCESS', { 
      originalTitle: title, 
      baseTitle, 
      variations,
      detectedCountry: title.match(/(korean|japanese|chinese|french|italian|spanish)/i)?.[1] || null,
      detectedYear: yearMatch?.[1] || null,
      usedUniversalPatterns: !foundInFranchiseMap,
      method: foundInFranchiseMap ? 'predefined_franchise' : 'universal_patterns'
    });
    
    return variations;
  }

  private sortOMDBResults(results: any[], searchTitle: string): any[] {
    // Extract year from search title if specified
    const yearMatch = searchTitle.match(/\b(19\d{2}|20\d{2})\b/);
    const requestedYear = yearMatch ? yearMatch[1] : null;
    
    // Sort OMDB results to prioritize specific years or recent movies
    const isRecentQuery = searchTitle.toLowerCase().includes('recent') || 
                         searchTitle.toLowerCase().includes('latest') ||
                         /20(2[3-9]|[3-9]\d)/.test(searchTitle); // 2023+
    
    if (requestedYear) {
      // If user specified a year, prioritize exact year matches first
      return results.sort((a, b) => {
        const yearA = parseInt(a.Year) || 0;
        const yearB = parseInt(b.Year) || 0;
        const requestedYearInt = parseInt(requestedYear);
        
        // Exact year match gets highest priority
        if (yearA === requestedYearInt && yearB !== requestedYearInt) return -1;
        if (yearB === requestedYearInt && yearA !== requestedYearInt) return 1;
        
        // If both or neither match, sort by closeness to requested year
        const diffA = Math.abs(yearA - requestedYearInt);
        const diffB = Math.abs(yearB - requestedYearInt);
        
        return diffA - diffB;
      });
    }
    
    if (isRecentQuery) {
      return results.sort((a, b) => {
        const yearA = parseInt(a.Year) || 0;
        const yearB = parseInt(b.Year) || 0;
        return yearB - yearA; // Newest first
      });
    }
    
    return results; // Keep original order
  }
  private normalizeMovieData(movieData: any): any {
    this.log('NORMALIZE_MOVIE_DATA', 'START', { 
      hasId: !!movieData.id,
      title: movieData.Title || movieData.title
    });

    const normalized = {
      id: movieData.id || crypto.randomUUID(),
      title: String(movieData.Title || movieData.title || ''),
      year: String(movieData.Year || movieData.year || ''),
      imdbID: String(movieData.imdbID || movieData.imdbid || ''),
      poster: String(movieData.Poster || movieData.poster || ''),
      imdbRating: String(movieData.imdbRating || movieData.imdbrating || 'N/A'),
      imdbVotes: String(movieData.imdbVotes || movieData.imdbvotes || ''),
      plot: String(movieData.Plot || movieData.plot || ''),
      director: String(movieData.Director || movieData.director || ''),
      actors: String(movieData.Actors || movieData.actors || ''),
      genre: String(movieData.Genre || movieData.genre || ''),
      created_at: movieData.created_at || new Date().toISOString(),
    };

    this.log('NORMALIZE_MOVIE_DATA', 'SUCCESS', {
      normalizedId: normalized.id,
      title: normalized.title,
      year: normalized.year,
      rating: normalized.imdbRating,
      hasAllFields: !!(normalized.title && normalized.year && normalized.imdbRating)
    });

    return normalized;
  }

  private async generateRecommendation(movieData: any, conversationId: string): Promise<any> {
    this.log('GENERATE_RECOMMENDATION', 'START', { 
      movieTitle: movieData.title,
      conversationId 
    });

    try {
      // Build context info with enhanced similar movie suggestions
      const conversation = this.conversationStore.get(conversationId);
      let contextInfo = "";
      
      if (conversation) {
        if (conversation.userPreferences.genres.length > 0) {
          contextInfo += `User likes: ${conversation.userPreferences.genres.join(', ')}. `;
        }
        if (conversation.discussedMovies.length > 0) {
          const recentMovie = conversation.discussedMovies[conversation.discussedMovies.length - 1];
          contextInfo += `Recently discussed: ${recentMovie.title}. `;
        }
      }
      
      // Add genre context to help with similar movie suggestions
      if (movieData.genre) {
        contextInfo += `Focus genre: ${movieData.genre}. `;
      }

      this.log('RECOMMENDATION_CONTEXT_BUILD', 'SUCCESS', { contextInfo });

      // Generate recommendation using LangChain
      const response = await this.recommendationChain.call({
        contextInfo,
        title: movieData.title,
        year: movieData.year,
        rating: movieData.imdbRating,
        genre: movieData.genre,
        plot: movieData.plot
      });      const tokensUsed = response.llmOutput?.tokenUsage?.totalTokens || 0;
      let recommendationText = response.text?.trim() || "";
      
      // No need to enhance with similar movies since our prompt already includes them
      
      // Ensure recommendation doesn't exceed database limits (safe truncation)
      const MAX_RECOMMENDATION_LENGTH = 600; // Adequate for concise but complete recommendations
      if (recommendationText.length > MAX_RECOMMENDATION_LENGTH) {
        // Truncate at last complete sentence to avoid mid-sentence cutoffs
        const truncated = recommendationText.substring(0, MAX_RECOMMENDATION_LENGTH);
        const lastSentence = truncated.lastIndexOf('.');
        if (lastSentence > 200) { // Only truncate at sentence if it's not too short
          recommendationText = truncated.substring(0, lastSentence + 1);
        } else {
          recommendationText = truncated.substring(0, MAX_RECOMMENDATION_LENGTH - 3) + '...';
        }
        this.log('RECOMMENDATION_TRUNCATED', 'SUCCESS', {
          originalLength: response.text?.length || 0,
          truncatedLength: recommendationText.length,
          truncatedAtSentence: lastSentence > 200
        });
      }
      
      const worthWatching = parseFloat(movieData.imdbRating || '0') >= 7.0;

      // Update conversation token count
      if (conversation) {
        conversation.totalTokens += tokensUsed;
        this.conversationStore.set(conversationId, conversation);
      }

      const recommendation = {
        id: crypto.randomUUID(),
        movie_id: movieData.id,
        recommendation: recommendationText,
        worth_watching: worthWatching,
        created_at: new Date().toISOString(),
        tokensUsed
      };

      this.log('GENERATE_RECOMMENDATION', 'SUCCESS', {
        recommendationLength: recommendationText.length,
        worthWatching,
        tokensUsed      }, tokensUsed);

      return recommendation;

    } catch (error: any) {
      this.log('GENERATE_RECOMMENDATION', 'ERROR', 'Failed to generate recommendation', undefined, error.message);
      
      // Fallback recommendation matching the expected format
      const similarMovies = this.getSimilarMoviesByGenre(movieData.genre || 'Drama');
      const worthWatching = parseFloat(movieData.imdbRating || '0') >= 7.0;
      const quality = worthWatching ? 'Worth watching with solid ratings and engaging content.' : 'Consider carefully as ratings suggest mixed reception.';
      
      const fallbackRecommendation = {
        id: crypto.randomUUID(),
        movie_id: movieData.id,
        recommendation: `"${movieData.title}" (${movieData.year}) - ${quality} Appeals to fans of ${movieData.genre} cinema and those seeking ${worthWatching ? 'quality entertainment' : 'alternative viewing'}. Similar movies: ${similarMovies.slice(0, 3).join(', ')}.`,
        worth_watching: worthWatching,
        created_at: new Date().toISOString(),
        tokensUsed: 0
      };

      this.log('GENERATE_RECOMMENDATION', 'SUCCESS', { fallback: true });
      return fallbackRecommendation;
    }
  }

  private async saveToDatabase(movieData: any, tempRecommendation: any, userId: string): Promise<any> {
    this.log('SAVE_TO_DATABASE', 'START', { 
      movieTitle: movieData.title,
      userId: userId ? 'provided' : 'null',
      hasExistingId: !!movieData.id
    });

    try {
      let movieSaved = false;
      let savedMovieId = movieData.id;

      // CRITICAL FIX: Always save a movie record for each user
      // Even if the movie exists globally, each user needs their own record
      // to see it in their movies tab
      
      // Check if this user already has this movie
      const { data: existingUserMovie, error: checkError } = await this.supabase
        .from("movies")
        .select("id")
        .eq("user_id", userId)
        .eq("imdbid", movieData.imdbID || movieData.imdbid)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        this.log('SAVE_MOVIE_CHECK', 'ERROR', 'Failed to check existing user movie', undefined, checkError.message);
      }

      if (existingUserMovie) {
        // User already has this movie, use the existing ID
        savedMovieId = existingUserMovie.id;
        movieSaved = true;
        this.log('SAVE_MOVIE_NEW', 'SKIP', { 
          reason: 'User already has this movie',
          movieId: savedMovieId
        });
      } else {
        // Create a new movie record for this user
        this.log('SAVE_MOVIE_NEW', 'START', { movieTitle: movieData.title, userId });
        
        const { data: dbMovie, error: movieError } = await this.supabase
          .from("movies")
          .insert({
            title: movieData.title,
            year: movieData.year,
            imdbid: movieData.imdbID || movieData.imdbid,
            poster: movieData.poster,
            imdbrating: movieData.imdbRating,
            imdbvotes: movieData.imdbVotes,
            plot: movieData.plot,
            director: movieData.director,
            actors: movieData.actors,
            genre: movieData.genre,
            user_id: userId,
          })
          .select()
          .single();

        if (movieError) {
          this.log('SAVE_MOVIE_NEW', 'ERROR', 'Failed to save movie', undefined, movieError.message);
        } else {
          movieSaved = true;
          savedMovieId = dbMovie.id;
          this.log('SAVE_MOVIE_NEW', 'SUCCESS', { 
            movieId: dbMovie.id,
            title: dbMovie.title,
            userId: userId
          });
        }
      }

      this.log('SAVE_TO_DATABASE', 'SUCCESS', { 
        movieSaved, 
        finalMovieId: savedMovieId
      });

      return {
        success: movieSaved,
        movieSaved,
        movieId: savedMovieId
      };

    } catch (error: any) {
      this.log('SAVE_TO_DATABASE', 'ERROR', 'Database save exception', undefined, error.message);
      return {
        success: false,
        movieSaved: false,
        error: error.message
      };
    }
  }
  public getLogs(): LogEntry[] {
    return this.logs;
  }

  public getSummary(): any {
    const totalTokens = this.logs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0);
    const errorCount = this.logs.filter(log => log.status === 'ERROR').length;
    const successCount = this.logs.filter(log => log.status === 'SUCCESS').length;
    const skipCount = this.logs.filter(log => log.status === 'SKIP').length;

    return {
      totalSteps: this.logs.length,
      successCount,
      errorCount,
      skipCount,
      totalTokens,
      estimatedCost: (totalTokens / 1000) * 0.00175 // GPT-3.5-turbo pricing
    };  }

  private isGeneralGreeting(query: string): boolean {
    const normalizedQuery = query.toLowerCase().trim();
    const greetingPatterns = [
      'hi', 'hello', 'hey', 'hi there', 'hello there',
      'good morning', 'good afternoon', 'good evening',
      'how are you', 'whats up', "what's up", 'sup',
      'how is goosebumps', 'how are goosebumps', 'goosebumps'
    ];
    
    return greetingPatterns.some(pattern => 
      normalizedQuery === pattern || 
      normalizedQuery.startsWith(pattern + ' ') ||
      normalizedQuery.endsWith(' ' + pattern)
    );
  }

  private getSimilarMoviesByGenre(genre: string): string[] {
    // Genre-based movie recommendation database
    const genreMovies: { [key: string]: string[] } = {
      'Action': ['John Wick', 'Mad Max: Fury Road', 'The Dark Knight', 'Terminator 2'],
      'Drama': ['The Shawshank Redemption', 'Forrest Gump', 'Goodfellas', 'Casablanca'],
      'Comedy': ['The Grand Budapest Hotel', 'Parasite', 'Superbad', 'Groundhog Day'],
      'Thriller': ['Gone Girl', 'Zodiac', 'Se7en', 'The Silence of the Lambs'],
      'Horror': ['Hereditary', 'The Conjuring', 'Get Out', 'A Quiet Place'],
      'Sci-Fi': ['Blade Runner 2049', 'Inception', 'Interstellar', 'The Matrix'],
      'Fantasy': ['The Lord of the Rings', 'Pan\'s Labyrinth', 'The Shape of Water', 'Big Fish'],
      'Romance': ['Before Sunset', 'Eternal Sunshine', 'Her', 'La La Land'],
      'Crime': ['Pulp Fiction', 'The Godfather', 'Fargo', 'No Country for Old Men'],
      'Animation': ['Spider-Man: Into the Spider-Verse', 'WALL-E', 'Your Name', 'Spirited Away'],
      'Adventure': ['Indiana Jones', 'Jurassic Park', 'Pirates of the Caribbean', 'Guardians of the Galaxy'],
      'War': ['Saving Private Ryan', 'Apocalypse Now', 'Dunkirk', '1917'],
      'Documentary': ['Free Solo', 'Won\'t You Be My Neighbor?', 'The Act of Killing', 'March of the Penguins'],
      'Biography': ['The Social Network', 'Steve Jobs', 'Malcolm X', 'Gandhi'],
      'Mystery': ['Knives Out', 'The Prestige', 'Shutter Island', 'Prisoners']
    };

    // Find matching genre (case insensitive, partial match)
    const lowerGenre = genre.toLowerCase();
    for (const [key, movies] of Object.entries(genreMovies)) {
      if (lowerGenre.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerGenre)) {
        // Return 3 random movies from the genre
        const shuffled = [...movies].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 3);
      }
    }

    // Fallback popular movies
    return ['The Dark Knight', 'Inception', 'Pulp Fiction'];
  }
}

export type { ChainContext, LogEntry, ConversationMemory };

