import { createClient } from '@supabase/supabase-js';

const url = 'https://vxzdgzncjmokpkoscqqt.supabase.co';
const anonKey = 'sb_publishable_eiRyF8O87XyRIgEC-row9A_wXO4vMo6';
const supabase = createClient(url, anonKey);

async function testSignUp() {
  const result = await supabase.auth.signUp({
    email: 'test_user_1773272370732@example.com',
    password: 'Password123!',
    options: {
      data: {
        display_name: 'TestUser',
      },
    },
  });

  console.log('SignUp result:', JSON.stringify(result, null, 2));
}

testSignUp();
