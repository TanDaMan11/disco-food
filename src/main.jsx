import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, Plus, Mountain, Sparkles, Clock3, Flame, ChevronRight, X, Pencil, Trash2, LogIn, LogOut, ShieldCheck, Star, Send } from 'lucide-react';
import { supabase } from './lib/supabase';
import './style.css';

const mealTypes = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'];
const banner = {
  Breakfast: { background: 'linear-gradient(135deg,#f59e0b,#facc15)', color: '#451a03' },
  Lunch: { background: 'linear-gradient(135deg,#10b981,#34d399)', color: '#022c22' },
  Dinner: { background: 'linear-gradient(135deg,#4f46e5,#8b5cf6)', color: '#fff' },
  Snack: { background: 'linear-gradient(135deg,#0284c7,#22d3ee)', color: '#082f49' },
  Dessert: { background: 'linear-gradient(135deg,#e11d48,#f472b6)', color: '#4c0519' },
};
const emailOk = email => /^[^@\s]+@stgeorges\.bc\.ca$/i.test(email.trim());
const parseEmail = email => {
  const [firstPart = '', lastPart = ''] = email.split('@')[0].split('.');
  const grad = (lastPart.match(/\d+/) || [])[0] || '';
  const last = lastPart.replace(/\d/g, '');
  return { first: firstPart ? firstPart[0].toUpperCase() + firstPart.slice(1) : '', last: last ? last[0].toUpperCase() + last.slice(1) : '', grad };
};

function App() {
  const [meals, setMeals] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState('signin');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(0);
  const [initialRating, setInitialRating] = useState(0);

  const loadMeals = async () => {
    const [{ data, error: mealError }, { data: allRatings, error: ratingError }] = await Promise.all([
      supabase.from('meals').select('*').order('created_at', { ascending: false }),
      supabase.from('meal_ratings').select('*'),
    ]);
    if (mealError) setError(mealError.message);
    if (ratingError) setError(ratingError.message);
    if (mealError) return;
    const rows = allRatings || [];
    setRatings(rows);
    setMeals((data || []).map(meal => {
      const mealRatings = rows.filter(row => String(row.meal_id) === String(meal.id));
      const average = mealRatings.length
        ? mealRatings.reduce((sum, row) => sum + Number(row.rating || 0), 0) / mealRatings.length
        : null;
      return { ...meal, avg_rating: average, rating_count: mealRatings.length };
    }));
  };

  const loadFeedback = async id => {
    const [ratingResult, commentResult] = await Promise.all([
      supabase.from('meal_ratings').select('*').eq('meal_id', id),
      supabase.from('meal_comments').select('*').eq('meal_id', id).order('created_at', { ascending: true }),
    ]);
    if (!ratingResult.error) {
      const rows = ratingResult.data || [];
      setRatings(rows);
      setRating(rows.find(row => row.rater_id === user?.id)?.rating || 0);
    }
    if (!commentResult.error) setComments(commentResult.data || []);
  };

  useEffect(() => {
    loadMeals();
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (user) supabase.from('profiles').select('*').eq('id', user.id).maybeSingle().then(({ data }) => setProfile(data));
    else setProfile(null);
  }, [user]);
  useEffect(() => { if (selected) loadFeedback(selected.id); }, [selected, user]);

  const name = profile ? `${profile.first_name} ${profile.last_name}` : user?.user_metadata?.first_name ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim() : '';
  const initials = (name || user?.email || 'U').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const filteredMeals = useMemo(() => meals.filter(meal =>
    [meal.title, meal.chef_name, meal.creator_name, meal.meal_type, meal.ingredients, meal.steps]
      .flat().filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase()) &&
    (filter === 'All' || String(meal.meal_type || '').toLowerCase() === filter.toLowerCase())
  ), [meals, query, filter]);
  const isMine = meal => user && (meal.creator_id === user.id || meal.creator_email?.toLowerCase() === user.email?.toLowerCase());

  async function login(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email')).trim().toLowerCase();
    const password = String(formData.get('password'));
    if (!emailOk(email)) { setError("Please use a St. George's email"); return; }
    const person = parseEmail(email);
    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { first_name: person.first, last_name: person.last, grad_year: person.grad } } });
    if (!result.error && mode === 'signup' && result.data.user) {
      await supabase.from('profiles').upsert({ id: result.data.user.id, email, first_name: person.first, last_name: person.last, grad_year: person.grad, role: 'student' });
    }
    if (result.error) setError(result.error.message);
    else setAuthOpen(false);
  }

  async function saveMeal(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const row = {
      title: formData.get('title'), chef_name: name, creator_name: name,
      meal_type: formData.get('meal_type'), prep_time_minutes: Number(formData.get('prep')) || 0,
      cook_time_minutes: Number(formData.get('cook')) || 0, cook_method: formData.get('method'),
      ingredients: String(formData.get('ingredients')).split('\n').filter(Boolean),
      steps: String(formData.get('steps')).split('\n').filter(Boolean), tips: formData.get('tips') || '',
      creator_id: user.id, creator_email: user.email, creator_grad_year: profile?.grad_year, dietary_tags: [],
    };
    const result = editing
      ? await supabase.from('meals').update(row).eq('id', editing.id)
      : await supabase.from('meals').insert(row).select().single();
    if (result.error) { setError(result.error.message); return; }
    const meal = result.data;
    if (!editing && initialRating && meal) await supabase.from('meal_ratings').upsert({ meal_id: meal.id, rater_id: user.id, rater_name: name, rating: initialRating }, { onConflict: 'meal_id,rater_id' });
    setFormOpen(false); setEditing(null); setInitialRating(0); loadMeals();
  }

  async function rate(value) {
    if (!user) { setAuthOpen(true); return; }
    const result = await supabase.from('meal_ratings').upsert({ meal_id: selected.id, rater_id: user.id, rater_name: name, rating: value }, { onConflict: 'meal_id,rater_id' });
    if (result.error) setError(result.error.message);
    else { setRating(value); loadFeedback(selected.id); loadMeals(); }
  }
  async function postComment(event) {
    event.preventDefault();
    if (!user) { setAuthOpen(true); return; }
    const result = await supabase.from('meal_comments').insert({ meal_id: selected.id, author_name: name, comment: comment.trim() });
    if (result.error) setError(result.error.message);
    else { setComment(''); loadFeedback(selected.id); }
  }
  async function deleteMeal(meal) {
    if (!window.confirm('Delete this recipe?')) return;
    const result = await supabase.from('meals').delete().eq('id', meal.id);
    if (result.error) setError(result.error.message);
    else { setSelected(null); loadMeals(); }
  }

  const stars = (value, clickable = false) => <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>{[1, 2, 3, 4, 5].map(number => <button type="button" key={number} onClick={clickable ? () => (selected ? rate(number) : setInitialRating(number)) : undefined} style={{ padding: 0, border: 0, background: 'transparent', color: '#d97706', cursor: clickable ? 'pointer' : 'default' }}><Star size={16} strokeWidth={1.8} fill={number <= value ? 'currentColor' : 'none'} /></button>)}</div>;
  const mealForm = meal => <form className="modal form" onSubmit={saveMeal}><button type="button" className="close" onClick={() => setFormOpen(false)}><X /></button><h2>{editing ? 'Edit meal' : 'Post a meal'}</h2><input name="title" required defaultValue={meal?.title || ''} placeholder="Meal name" /><select name="meal_type" defaultValue={meal?.meal_type || 'Breakfast'}>{mealTypes.slice(1).map(type => <option key={type}>{type}</option>)}</select><div style={{ margin: '8px 0' }}>Initial rating (optional){stars(initialRating, true)}</div><input name="prep" type="number" defaultValue={meal?.prep_time_minutes || 0} placeholder="Prep minutes" /><input name="cook" type="number" defaultValue={meal?.cook_time_minutes || 0} placeholder="Cook minutes" /><select name="method" defaultValue={meal?.cook_method || 'one-pot'}><option>one-pot</option><option>camp stove</option><option>fire</option><option>no-cook</option></select><textarea name="ingredients" required defaultValue={(meal?.ingredients || []).join('\n')} placeholder="Ingredients, one per line" /><textarea name="steps" required defaultValue={(meal?.steps || []).join('\n')} placeholder="Steps, one per line" /><textarea name="tips" defaultValue={meal?.tips || ''} placeholder="Trail tips" /><button className="submit">Save recipe</button></form>;

  return <div className="app"><header><div className="brand"><div className="mark"><Mountain size={22} /></div><div><b>Discovery 10 Food Handbook</b><small>ST. GEORGE'S DISCOVERY 10 OUTDOOR ED</small></div></div><div className="meta">{user && <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, background: '#34d399', color: '#022c22', border: '2px solid #064e3b' }}>{initials}</span><span><ShieldCheck size={15} color="#334155" /> {name}</span></span>}<button className="post" onClick={() => user ? setFormOpen(true) : setAuthOpen(true)}><Plus size={16} color="#334155" /> Create</button>{!user && <button className="post" onClick={() => setAuthOpen(true)}><LogIn size={16} color="#334155" /> Sign In</button>}{user && <button className="post" onClick={() => supabase.auth.signOut()}><LogOut size={15} color="#334155" /></button>}</div></header><main><section className="hero"><div><p className="eyebrow"><Sparkles size={15} /> FIELD NOTES FOR GOOD EATING</p><h1>Good food.<br /><i>Wild places.</i></h1><p className="intro">A shared recipe book for the Discovery 10 crew.</p></div><div className="hero-art"><div className="sun" /><Mountain size={170} /></div></section><section className="toolbar"><div className="search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search meals, meal types, ingredients, cooks..." /></div><div className="filters">{mealTypes.map(type => <button className={filter === type ? 'active' : ''} onClick={() => setFilter(type)} key={type}>{type}</button>)}</div></section>{error && <div className="live">{error}</div>}<section className="grid">{filteredMeals.length > 0 ? filteredMeals.map(meal => { const style = banner[meal.meal_type] || banner.Snack; return <article className="card" key={meal.id} onClick={() => setSelected(meal)}><div className="card-top" style={style}><span>{meal.meal_type || 'Meal'}</span></div><div className="card-body"><div className="tagline"><ShieldCheck size={14} /> {meal.creator_grad_year ? `Class of '${meal.creator_grad_year}` : 'Field recipe'}</div><h2>{meal.title}</h2><p>Shared by <b>{meal.chef_name || meal.creator_name || 'the Discovery 10 crew'}</b></p><div className="compact-rating text-xs" style={{ fontSize: '.75rem' }}>★ {meal.rating_count ? Number(meal.avg_rating).toFixed(1) : '—'} ({meal.rating_count || 0} rating{meal.rating_count === 1 ? '' : 's'})</div><div className="meta"><span><Clock3 size={15} />{(meal.prep_time_minutes || 0) + (meal.cook_time_minutes || 0)} min</span><span><Flame size={15} />{meal.cook_method}</span><ChevronRight size={18} /></div></div></article>; }) : <div role="status" className="no-meals" style={{ gridColumn: '1 / -1', padding: '32px 24px', textAlign: 'center', background: '#fff', color: '#172554', border: '2px solid #1e3a8a', borderRadius: 16, fontWeight: 700, fontSize: '1.1rem' }}>No meals found<p style={{ margin: '8px 0 0', fontWeight: 500, fontSize: '.95rem' }}>Try another search or category, or clear your search to see all meals.</p>{(query || filter !== 'All') && <button className="post" onClick={() => { setQuery(''); setFilter('All'); }} style={{ marginTop: 12 }}>Clear filters</button>}</div>}</section></main>{(selected || formOpen || authOpen) && <div className="overlay" onClick={event => { if (event.target === event.currentTarget) { setSelected(null); setFormOpen(false); setAuthOpen(false); } }}>{authOpen ? <form className="modal form" onSubmit={login}><button type="button" className="close" onClick={() => setAuthOpen(false)}><X /></button><h2>{mode === 'signin' ? 'Sign in' : 'Join Disco Food'}</h2><div className="filters"><button type="button" onClick={() => setMode('signin')}>Sign In</button><button type="button" onClick={() => setMode('signup')}>Sign Up</button></div><input name="email" type="email" required placeholder="firstname.lastnameYY@stgeorges.bc.ca" /><input name="password" type="password" required minLength="8" placeholder="Password" /><button className="submit">{mode === 'signin' ? 'Log in' : 'Create account'}</button></form> : formOpen ? mealForm(editing) : <div className="modal detail"><button className="close" onClick={() => setSelected(null)}><X /></button><div className="detail-kicker">{selected.meal_type}</div><h2>{selected.title}</h2><p className="byline">Shared by {selected.chef_name || selected.creator_name || 'the Discovery 10 crew'}</p>{isMine(selected) && <div className="meta"><button className="post" onClick={() => { setEditing(selected); setSelected(null); setFormOpen(true); }}><Pencil size={15} color="#334155" /> Edit</button><button className="post" onClick={() => deleteMeal(selected)}><Trash2 size={15} color="#334155" /> Delete</button></div>}<div className="detail-cols"><div><h3>Pack list</h3>{(selected.ingredients || []).map((item, index) => <label className="check" key={index}><input type="checkbox" />{item}</label>)}</div><div><h3>Make it happen</h3><ol>{(selected.steps || []).map((step, index) => <li key={index}>{step}</li>)}</ol></div></div><section className="feedback"><h3>Rate this meal</h3>{stars(rating, true)}<small>{ratings.length ? `★ ${(ratings.reduce((sum, row) => sum + Number(row.rating || 0), 0) / ratings.length).toFixed(1)} (${ratings.length} rating${ratings.length === 1 ? '' : 's'})` : 'No ratings yet'}{rating ? ` · Your rating: ${rating} ★` : ''}</small><h3>Comments</h3>{comments.map(item => <p key={item.id}><b>{item.author_name}:</b> {item.comment}</p>)}<form onSubmit={postComment}><input value={comment} onChange={event => setComment(event.target.value)} placeholder="Add a comment..." /><button className="post" type="submit"><Send size={15} color="#334155" /> Post</button></form></section></div>}</div>}</div>}

createRoot(document.getElementById('root')).render(<App />);
