const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || '';

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

export async function fetchExercises(category?: string): Promise<QueryResult<any[]>> {
  try {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    
    const response = await fetch(`${API_BASE_URL}/api/exercises?${params}`);
    if (!response.ok) throw new Error('Failed to fetch exercises');
    
    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchExerciseById(id: string): Promise<QueryResult<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/exercises/${id}`);
    if (!response.ok) throw new Error('Exercise not found');
    
    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function saveEvaluation(evaluation: any): Promise<QueryResult<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/evaluations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evaluation),
    });
    if (!response.ok) throw new Error('Failed to save evaluation');
    
    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchEvaluationHistory(userId: string): Promise<QueryResult<any[]>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/evaluations/user/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch evaluations');
    
    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function saveWorkoutLog(log: any): Promise<QueryResult<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/workout-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log),
    });
    if (!response.ok) throw new Error('Failed to save workout log');
    
    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchWorkoutLogs(userId: string): Promise<QueryResult<any[]>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/workout-logs/user/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch workout logs');
    
    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function saveProgress(progress: any): Promise<QueryResult<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(progress),
    });
    if (!response.ok) throw new Error('Failed to save progress');
    
    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchProgressHistory(
  userId: string, 
  metricType?: string
): Promise<QueryResult<any[]>> {
  try {
    const params = new URLSearchParams();
    if (metricType) params.append('metricType', metricType);
    
    const response = await fetch(`${API_BASE_URL}/api/progress/user/${userId}?${params}`);
    if (!response.ok) throw new Error('Failed to fetch progress');
    
    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchPaymentHistory(userId: string): Promise<QueryResult<any[]>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/payments/user/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch payments');
    
    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchWorkoutTemplates(isPublic?: boolean): Promise<QueryResult<any[]>> {
  try {
    const params = new URLSearchParams();
    if (isPublic !== undefined) params.append('public', String(isPublic));
    
    const response = await fetch(`${API_BASE_URL}/api/workout-templates?${params}`);
    if (!response.ok) throw new Error('Failed to fetch templates');
    
    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}
