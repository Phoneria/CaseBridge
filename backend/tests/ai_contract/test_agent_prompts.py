"""AI Agents (section 12, 22 - AI Agents).

Each agent must receive a distinct, role-correct system prompt. This
guards against prompt cross-contamination - e.g. the Plaintiff agent
accidentally receiving Judge neutrality instructions.
"""


def test_judge_prompt_is_neutral_and_free_of_advocacy_instructions():
    from app.ai.agents import judge

    prompt = judge.SYSTEM_PROMPT
    assert "tarafsız" in prompt.lower() or "hakim" in prompt.lower()
    assert "en güçlü davacı" not in prompt.lower()
    assert "en güçlü savunma" not in prompt.lower()


def test_plaintiff_prompt_builds_plaintiff_case_only():
    from app.ai.agents import plaintiff

    prompt = plaintiff.SYSTEM_PROMPT
    assert "davacı" in prompt.lower()
    assert "tarafsız" not in prompt.lower()
    assert "en güçlü savunmayı" not in prompt.lower()


def test_defendant_prompt_builds_defense_only():
    from app.ai.agents import defendant

    prompt = defendant.SYSTEM_PROMPT
    assert "davalı" in prompt.lower() or "savunma" in prompt.lower()
    assert "tarafsız" not in prompt.lower()
    assert "en güçlü davacı" not in prompt.lower()


def test_researcher_prompt_focuses_on_legal_research_only():
    from app.ai.agents import researcher

    prompt = researcher.SYSTEM_PROMPT
    assert "araştırma" in prompt.lower()
    assert "en güçlü davacı" not in prompt.lower()
    assert "en güçlü savunmayı" not in prompt.lower()


def test_all_agents_forbid_fabricating_real_legal_sources():
    from app.ai.agents import defendant, judge, plaintiff, researcher

    for module in (judge, plaintiff, defendant, researcher):
        prompt = module.SYSTEM_PROMPT.lower()
        assert "uydurma" in prompt or "fabricate" in prompt
        assert "doğrulama" in prompt or "verification" in prompt


def test_judge_prompt_instructs_structured_json_output():
    from app.ai.agents import judge

    prompt = judge.SYSTEM_PROMPT.lower()
    assert "json" in prompt
    assert "assessment" in prompt
    assert "score" in prompt


def test_plaintiff_user_prompt_includes_case_context():
    from app.ai.agents import plaintiff

    context = {"case_name": "Test Davasi", "description": "Ozet bilgi"}
    user_prompt = plaintiff.build_user_prompt(context, researcher_notes="Arastirma notlari")
    assert "Test Davasi" in user_prompt
    assert "Arastirma notlari" in user_prompt


def test_judge_user_prompt_includes_all_prior_perspectives():
    from app.ai.agents import judge

    context = {"case_name": "Test Davasi"}
    user_prompt = judge.build_user_prompt(
        context,
        researcher_notes="RESEARCHER_NOTES_MARKER",
        plaintiff_argument="PLAINTIFF_ARGUMENT_MARKER",
        defendant_argument="DEFENDANT_ARGUMENT_MARKER",
    )
    assert "RESEARCHER_NOTES_MARKER" in user_prompt
    assert "PLAINTIFF_ARGUMENT_MARKER" in user_prompt
    assert "DEFENDANT_ARGUMENT_MARKER" in user_prompt
