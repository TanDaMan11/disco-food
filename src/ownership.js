export const TANNER_EMAIL='tanner.scarlett29@stgeorges.bc.ca';
export function mealBelongsToUser(meal,userEmail='',localToken='',localName=''){
 const email=String(userEmail).trim().toLowerCase();
 const chef=String(meal.chef_name||'').trim().toLowerCase();
 return Boolean((meal.creator_email&&meal.creator_email.toLowerCase()===email)||(meal.creator_token&&meal.creator_token===localToken)||(chef&&chef.includes('tanner')&&email===TANNER_EMAIL)||(chef&&localName&&chef===localName.trim().toLowerCase()));
}