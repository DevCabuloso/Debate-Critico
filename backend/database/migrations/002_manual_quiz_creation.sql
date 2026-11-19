create or replace function public.create_manual_quiz(p_video_id uuid, p_questions jsonb)
returns table (quiz_id uuid, version integer, status text)
language plpgsql
set search_path = ''
as $function$
declare
  v_video_id uuid;
  v_quiz_id uuid;
  v_version integer;
  v_question jsonb;
  v_question_index integer;
  v_question_id uuid;
  v_statement text;
  v_explanation text;
  v_category text;
  v_difficulty text;
  v_evidence_excerpt text;
  v_timestamp_seconds integer;
  v_timestamp_text text;
  v_option jsonb;
  v_option_index integer;
  v_option_count integer;
  v_option_id uuid;
  v_option_text text;
  v_seen_options text[];
  v_correct_option integer;
  v_correct_option_text text;
  v_correct_option_id uuid;
begin
  if jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'As questões devem ser enviadas como uma lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_questions) < 1 or jsonb_array_length(p_questions) > 50 then
    raise exception 'O questionário deve ter entre 1 e 50 questões.' using errcode = '22023';
  end if;

  select v.id into v_video_id
  from public.videos v
  where v.id = p_video_id and v.deleted_at is null
  for update;
  if not found then
    raise exception 'Debate não encontrado.' using errcode = 'P0002';
  end if;

  select coalesce(max(q.version), 0) + 1 into v_version
  from public.quizzes q
  where q.video_id = p_video_id;

  insert into public.quizzes (video_id, version, status)
  values (p_video_id, v_version, 'PENDING_REVIEW')
  returning id into v_quiz_id;

  for v_question, v_question_index in
    select item.value, item.ordinality::integer
    from jsonb_array_elements(p_questions) with ordinality as item(value, ordinality)
  loop
    v_statement := btrim(coalesce(v_question ->> 'statement', ''));
    v_explanation := btrim(coalesce(v_question ->> 'explanation', ''));
    v_category := btrim(coalesce(v_question ->> 'category', ''));
    v_difficulty := v_question ->> 'difficulty';
    v_evidence_excerpt := btrim(coalesce(v_question ->> 'evidence_excerpt', ''));
    v_timestamp_seconds := null;
    v_timestamp_text := v_question ->> 'timestamp_seconds';

    if length(v_statement) not between 1 and 1000
      or length(v_explanation) not between 1 and 2000
      or length(v_category) not between 1 and 100
      or length(v_evidence_excerpt) not between 1 and 2000
      or v_difficulty is null
      or v_difficulty not in ('EASY', 'MEDIUM', 'HARD') then
      raise exception 'A questão % contém campos inválidos.', v_question_index using errcode = '22023';
    end if;

    if v_timestamp_text is not null then
      if jsonb_typeof(v_question -> 'timestamp_seconds') <> 'number'
        or v_timestamp_text !~ '^[0-9]+$'
        or length(v_timestamp_text) > 10 then
        raise exception 'O timestamp da questão % deve ser um inteiro não negativo.', v_question_index using errcode = '22023';
      end if;
      if v_timestamp_text::numeric > 2147483647 then
        raise exception 'O timestamp da questão % está fora do limite permitido.', v_question_index using errcode = '22023';
      end if;
      v_timestamp_seconds := v_timestamp_text::integer;
    end if;

    if jsonb_typeof(v_question -> 'options') is distinct from 'array' then
      raise exception 'As alternativas da questão % devem ser uma lista.', v_question_index using errcode = '22023';
    end if;
    v_option_count := jsonb_array_length(v_question -> 'options');
    if v_option_count < 2 or v_option_count > 6 then
      raise exception 'A questão % deve ter entre 2 e 6 alternativas.', v_question_index using errcode = '22023';
    end if;

    v_correct_option_text := v_question ->> 'correct_option';
    if v_correct_option_text is null
      or v_correct_option_text !~ '^[0-9]+$'
      or length(v_correct_option_text) > 2 then
      raise exception 'A questão % não tem uma alternativa correta válida.', v_question_index using errcode = '22023';
    end if;
    v_correct_option := v_correct_option_text::integer;
    if v_correct_option >= v_option_count then
      raise exception 'A questão % não tem uma alternativa correta válida.', v_question_index using errcode = '22023';
    end if;

    insert into public.questions (
      quiz_id, statement, explanation, category, difficulty, evidence_excerpt, timestamp_seconds
    )
    values (
      v_quiz_id, v_statement, v_explanation, v_category, v_difficulty, v_evidence_excerpt, v_timestamp_seconds
    )
    returning id into v_question_id;

    v_seen_options := array[]::text[];
    v_correct_option_id := null;
    for v_option, v_option_index in
      select option_item.value, option_item.ordinality::integer - 1
      from jsonb_array_elements(v_question -> 'options') with ordinality as option_item(value, ordinality)
    loop
      v_option_text := btrim(coalesce(v_option ->> 'text', ''));
      if jsonb_typeof(v_option) is distinct from 'object'
        or length(v_option_text) not between 1 and 500
        or lower(v_option_text) = any(v_seen_options) then
        raise exception 'A questão % contém alternativas vazias, repetidas ou inválidas.', v_question_index using errcode = '22023';
      end if;
      v_seen_options := array_append(v_seen_options, lower(v_option_text));

      insert into public.question_options (question_id, content, position_hint)
      values (v_question_id, v_option_text, v_option_index + 1)
      returning id into v_option_id;

      if v_option_index = v_correct_option then
        v_correct_option_id := v_option_id;
      end if;
    end loop;

    insert into public.question_answer_keys (question_id, correct_option_id)
    values (v_question_id, v_correct_option_id);
  end loop;

  return query select v_quiz_id, v_version, 'PENDING_REVIEW'::text;
end;
$function$;

revoke all on function public.create_manual_quiz(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_manual_quiz(uuid, jsonb) to service_role;
