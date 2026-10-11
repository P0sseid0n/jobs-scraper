import { describe, expect, test } from 'bun:test'

import { postedAtFromUrn, postUrlFromUrn, resolvePostUrn, urnFromComponentKey } from './post-urn'

describe('URN do post', () => {
	test('monta o link do post', () => {
		expect(postUrlFromUrn('urn:li:activity:7058939392341180416')).toBe(
			'https://www.linkedin.com/feed/update/urn:li:activity:7058939392341180416/',
		)
	})

	test('extrai a data de publicação do ID', () => {
		expect(postedAtFromUrn('urn:li:activity:7058939392341180416')).toBe('2023-05-01T23:04:59.886Z')
	})

	test('retorna null para URNs sem ID válido', () => {
		expect(postedAtFromUrn('urn:li:activity:abc')).toBeNull()
		expect(postedAtFromUrn('urn:li:activity:123456789012345')).toBeNull()
	})
})

describe('resolvePostUrn', () => {
	test('extrai o URN do id da caixa de tradução (layout atual)', () => {
		const shareId =
			'translatable-commentary-FeTranslationUrn(contentUrnCommentUrn=null, contentUrnGroupPostUrn=null, contentUrnShareUrn=ContentUrnShareUrn(shareUrn=ShareUrn(shareId=7513649051440021505)), contentUrnUgcPostUrn=null)'
		const ugcPost =
			'translatable-commentary-FeTranslationUrn(contentUrnShareUrn=null, contentUrnUgcPostUrn=ContentUrnUgcPostUrn(userGeneratedContentPostUrn=UserGeneratedContentPostUrn(userGeneratedContentId=7513634933928767488)))'

		expect(resolvePostUrn([shareId])).toBe('urn:li:share:7513649051440021505')
		expect(resolvePostUrn([ugcPost])).toBe('urn:li:ugcPost:7513634933928767488')
	})

	test('prefere o link de activity ao groupPost em posts de grupo', () => {
		const groupPost =
			'translatable-commentary-FeTranslationUrn(contentUrnGroupPostUrn=ContentUrnGroupPostUrn(groupPostUrn=GroupPostUrn(groupId=44194, postId=7513605191817080832)))'
		const link =
			'https://www.linkedin.com/groups/44194/?q=highlightedFeedForGroups&highlightedUpdateUrn=urn:li:activity:7513605192798363648'

		expect(resolvePostUrn([groupPost, link])).toBe('urn:li:activity:7513605192798363648')
		expect(resolvePostUrn([groupPost])).toBe('urn:li:groupPost:44194-7513605191817080832')
	})

	test('aceita data-urn antigo e links codificados', () => {
		expect(resolvePostUrn(['urn:li:activity:7058939392341180416'])).toBe('urn:li:activity:7058939392341180416')
		expect(resolvePostUrn(['/feed/update/urn%3Ali%3AugcPost%3A7483645236414480384/'])).toBe('urn:li:ugcPost:7483645236414480384')
		expect(resolvePostUrn(['https://www.linkedin.com/in/fulano/'])).toBeNull()
	})
})

describe('urnFromComponentKey', () => {
	// Chaves reais da busca (out/2026), com o URN que o LinkedIn mandou junto no HTML
	const keys = {
		'CgsIgMDJ0JC9lMvQAQ-replaceableCommentToolsxdiLddY4Q4urmqtKV6WcfMECc0yJu3FOdWtvEsOQBuQFeedType_FLAGSHIP_SEARCH':
			'urn:li:activity:7515145433866907648',
		'CgsIgIDRlImsgMvQAQ-commentsSectionAnchorRefxYvb6ydUE7ojid1Lkui1FB5GY7SSUJyQNKloP1oGuMgFeedType_FLAGSHIP_SEARCH':
			'urn:li:activity:7515101160341643264',
		'EgsIgMDOgMfl4MTQAQ-replaceableCommentToolsi7xzRlyMf1vR-fqXlTqTMqfCgQa406lrasFJQSSYCkAFeedType_FLAGSHIP_SEARCH':
			'urn:li:ugcPost:7513342929290252288',
	}

	test('lê o tipo e o ID do prefixo da componentkey (activity e ugcPost)', () => {
		for (const [key, urn] of Object.entries(keys)) expect(urnFromComponentKey(key)).toBe(urn)
	})

	test('resolvePostUrn usa a componentkey quando o card não tem outro id', () => {
		expect(resolvePostUrn(['update-card-focusxdiLdd', Object.keys(keys)[0]!])).toBe('urn:li:activity:7515145433866907648')
	})

	test('ignora chaves que não são desse formato', () => {
		expect(urnFromComponentKey('update-card-focusxdiLddY4Q4urmqtKV6WcfMECc0yJu3FOdWtvEsOQBuQ')).toBeNull()
		expect(urnFromComponentKey('59b1ae7a-d2b4-4c1e-8f6f-6f36129fb285')).toBeNull()
		expect(resolvePostUrn(['Cg-qualquer-coisa'])).toBeNull()
	})
})
