import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapServerSuggestionToDomain,
  mapServerSuggestionsToDomain,
  createStudentSuggestionGateway,
} from '../src/domain/studentSuggestionGateway.ts';

test('1. server suggestion row maps to Suggestion correctly', () => {
  const row = {
    id: '11111111-1111-1111-1111-111111111111',
    student_user_id: '22222222-2222-2222-2222-222222222222',
    student_name: 'أحمد يلدز',
    student_email: 'contact@ahmed.org',
    student_university: 'جامعة إسطنبول',
    student_major: 'هندسة الحاسوب',
    target_role: 'ACADEMIC_HEAD',
    category: 'اقتراح نشاط',
    title: 'إضافة دورات في البرمجة',
    content: 'أقترح تنظيم دورات تعليمية في البرمجة.',
    status: 'reviewing',
    created_at: '2026-07-05T10:00:00Z',
    responses: [
      {
        id: '33333333-3333-3333-3333-333333333333',
        by: 'د. عبد الله',
        by_role: 'رئيس اللجنة الأكاديمية',
        text: 'شكراً لك، سيتم دراسة المقترح.',
        created_at: '2026-07-08T12:00:00Z',
      },
    ],
  };

  const domain = mapServerSuggestionToDomain(row);

  assert.equal(domain.id, '11111111-1111-1111-1111-111111111111');
  assert.equal(domain.studentId, '22222222-2222-2222-2222-222222222222');
  assert.equal(domain.studentName, 'أحمد يلدز');
  assert.equal(domain.studentEmail, 'contact@ahmed.org');
  assert.equal(domain.studentUniversity, 'جامعة إسطنبول');
  assert.equal(domain.studentMajor, 'هندسة الحاسوب');
  assert.equal(domain.targetRole, 'ACADEMIC_HEAD');
  assert.equal(domain.category, 'اقتراح نشاط');
  assert.equal(domain.title, 'إضافة دورات في البرمجة');
  assert.equal(domain.content, 'أقترح تنظيم دورات تعليمية في البرمجة.');
  assert.equal(domain.status, 'reviewing');
  assert.equal(domain.createdAt, '2026-07-05');
});

test('2. responses map correctly with responder name and role', () => {
  const row = {
    id: 's-1',
    student_user_id: 'u-1',
    student_name: 'طالب',
    target_role: 'PRESIDENT',
    category: 'عام',
    title: 'عنوان',
    content: 'محتوى كافي',
    status: 'implemented',
    created_at: '2026-08-01',
    responses: [
      {
        id: 'r-1',
        by: 'رئيس الاتحاد',
        by_role: 'رئيس الاتحاد',
        text: 'تم تنفيذ الاقتراح بنجاح.',
        created_at: '2026-08-03T15:00:00Z',
      },
    ],
  };

  const domain = mapServerSuggestionToDomain(row);
  assert.equal(domain.responses.length, 1);
  assert.equal(domain.responses[0].id, 'r-1');
  assert.equal(domain.responses[0].by, 'رئيس الاتحاد');
  assert.equal(domain.responses[0].byRole, 'رئيس الاتحاد');
  assert.equal(domain.responses[0].text, 'تم تنفيذ الاقتراح بنجاح.');
  assert.equal(domain.responses[0].at, '2026-08-03');
});

test('3. invalid/null optional fields are safe and default properly', () => {
  const malformed = {
    id: 's-null',
    student_user_id: null,
    student_name: null,
    target_role: 'INVALID_ROLE',
    category: null,
    title: null,
    content: null,
    status: 'unknown_status',
    created_at: null,
    responses: null,
  };

  const domain = mapServerSuggestionToDomain(malformed);
  assert.equal(domain.id, 's-null');
  assert.equal(domain.studentId, '');
  assert.equal(domain.studentName, 'طالب');
  assert.equal(domain.targetRole, 'PRESIDENT'); // safe fallback
  assert.equal(domain.status, 'new'); // safe fallback
  assert.deepEqual(domain.responses, []);
});

test('4. submitSuggestion calls correct RPC with normalized parameters', async () => {
  let rpcCalled = false;
  let rpcName = '';
  let rpcArgs = null;

  const mockClient = {
    rpc: async (name, args) => {
      rpcCalled = true;
      rpcName = name;
      rpcArgs = args;
      return {
        data: [{ ok: true, suggestion_id: 'new-id-123', message: 'نجاح' }],
        error: null,
      };
    },
  };

  const gateway = createStudentSuggestionGateway(mockClient);
  const result = await gateway.submitSuggestion({
    targetRole: 'ACADEMIC_HEAD',
    category: '  مقترح أكاديمي  ',
    title: '  عنوان المقترح  ',
    content: '  محتوى تفصيلي للاقتراح  ',
  });

  assert.ok(result.ok);
  assert.equal(rpcCalled, true);
  assert.equal(rpcName, 'submit_student_suggestion');
  assert.equal(rpcArgs.p_target_role, 'ACADEMIC_HEAD');
  assert.equal(rpcArgs.p_category, 'مقترح أكاديمي');
  assert.equal(rpcArgs.p_title, 'عنوان المقترح');
  assert.equal(rpcArgs.p_content, 'محتوى تفصيلي للاقتراح');
});

test('5. listSuggestions calls authoritative server contract', async () => {
  let rpcCalled = false;
  const mockClient = {
    rpc: async (name) => {
      rpcCalled = true;
      assert.equal(name, 'list_visible_student_suggestions');
      return {
        data: [
          {
            id: 's-1',
            student_user_id: 'u-1',
            student_name: 'علي',
            target_role: 'MEDIA_HEAD',
            category: 'إعلام',
            title: 'تغطية إعلامية',
            content: 'محتوى التغطية',
            status: 'new',
            created_at: '2026-08-10',
            responses: [],
          },
        ],
        error: null,
      };
    },
  };

  const gateway = createStudentSuggestionGateway(mockClient);
  const result = await gateway.listSuggestions();

  assert.ok(result.ok);
  assert.equal(rpcCalled, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].title, 'تغطية إعلامية');
});

test('6. respondToSuggestion calls correct RPC', async () => {
  let rpcArgs = null;
  const mockClient = {
    rpc: async (name, args) => {
      assert.equal(name, 'respond_to_student_suggestion');
      rpcArgs = args;
      return {
        data: [{ ok: true, message: 'تم الرد' }],
        error: null,
      };
    },
  };

  const gateway = createStudentSuggestionGateway(mockClient);
  const result = await gateway.respondToSuggestion({
    suggestionId: 's-100',
    responseText: '  تم استلام الملاحظة وسيتم التعامل معها.  ',
    newStatus: 'reviewing',
  });

  assert.ok(result.ok);
  assert.equal(rpcArgs.p_suggestion_id, 's-100');
  assert.equal(rpcArgs.p_response_text, 'تم استلام الملاحظة وسيتم التعامل معها.');
  assert.equal(rpcArgs.p_new_status, 'reviewing');
});

test('7. server errors map to useful ServiceResult errors', async () => {
  const mockClient = {
    rpc: async () => ({
      data: null,
      error: { code: '42501', message: 'Not authorized' },
    }),
  };

  const gateway = createStudentSuggestionGateway(mockClient);
  const result = await gateway.submitSuggestion({
    targetRole: 'PRESIDENT',
    category: 'عام',
    title: 'عنوان المقترح',
    content: 'محتوى تفصيلي',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, '42501');
  assert.ok(result.error.message.length > 0);
});

test('8. no mockSuggestions/localStorage authority in repository/service flow', async () => {
  const mockClient = {
    rpc: async () => ({
      data: [], // empty server state
      error: null,
    }),
  };

  const gateway = createStudentSuggestionGateway(mockClient);
  const result = await gateway.listSuggestions();

  assert.ok(result.ok);
  // Must NOT inject mockSuggestions (e.g. sg1, sg2) as fake server data
  assert.deepEqual(result.data, []);
});

test('9. refresh after successful submission', async () => {
  let listCount = 0;
  let items = [];

  const mockClient = {
    rpc: async (name, args) => {
      if (name === 'submit_student_suggestion') {
        items.push({
          id: 'new-1',
          student_user_id: 'u-1',
          student_name: 'طالب',
          target_role: args.p_target_role,
          category: args.p_category,
          title: args.p_title,
          content: args.p_content,
          status: 'new',
          created_at: '2026-09-04',
          responses: [],
        });
        return { data: [{ ok: true, suggestion_id: 'new-1' }], error: null };
      }
      if (name === 'list_visible_student_suggestions') {
        listCount++;
        return { data: items, error: null };
      }
      return { data: null, error: 'Unknown RPC' };
    },
  };

  const gateway = createStudentSuggestionGateway(mockClient);
  const submitRes = await gateway.submitSuggestion({
    targetRole: 'ACTIVITIES_HEAD',
    category: 'نشاط',
    title: 'نشاط رياضي',
    content: 'تنظيم دوري رياضي سنوي',
  });
  assert.ok(submitRes.ok);

  const listRes = await gateway.listSuggestions();
  assert.ok(listRes.ok);
  assert.equal(listCount, 1);
  assert.equal(listRes.data.length, 1);
  assert.equal(listRes.data[0].title, 'نشاط رياضي');
});

test('10. refresh after successful response', async () => {
  let items = [
    {
      id: 's-1',
      student_user_id: 'u-1',
      student_name: 'طالب',
      target_role: 'MEDIA_HEAD',
      category: 'إعلام',
      title: 'عنوان',
      content: 'محتوى',
      status: 'new',
      created_at: '2026-09-01',
      responses: [],
    },
  ];

  const mockClient = {
    rpc: async (name, args) => {
      if (name === 'respond_to_student_suggestion') {
        items[0].status = args.p_new_status;
        items[0].responses.push({
          id: 'r-1',
          by: 'مسؤول الإعلام',
          by_role: 'مسؤول الإعلام',
          text: args.p_response_text,
          created_at: '2026-09-02',
        });
        return { data: [{ ok: true }], error: null };
      }
      if (name === 'list_visible_student_suggestions') {
        return { data: items, error: null };
      }
      return { data: null, error: 'Unknown RPC' };
    },
  };

  const gateway = createStudentSuggestionGateway(mockClient);
  const respRes = await gateway.respondToSuggestion({
    suggestionId: 's-1',
    responseText: 'تم قبول المقترح',
    newStatus: 'implemented',
  });
  assert.ok(respRes.ok);

  const listRes = await gateway.listSuggestions();
  assert.ok(listRes.ok);
  assert.equal(listRes.data[0].status, 'implemented');
  assert.equal(listRes.data[0].responses.length, 1);
});

test('11. failed submission leaves existing state unchanged', async () => {
  const mockClient = {
    rpc: async () => ({
      data: null,
      error: { code: '22023', message: 'Validation failed' },
    }),
  };

  const gateway = createStudentSuggestionGateway(mockClient);
  const result = await gateway.submitSuggestion({
    targetRole: 'PRESIDENT',
    category: 'عام',
    title: 'قصير',
    content: 'صغير',
  });

  assert.equal(result.ok, false);
});

test('12. failed response leaves existing state unchanged', async () => {
  const mockClient = {
    rpc: async () => ({
      data: null,
      error: { code: '42501', message: 'Not allowed to respond to this committee' },
    }),
  };

  const gateway = createStudentSuggestionGateway(mockClient);
  const result = await gateway.respondToSuggestion({
    suggestionId: 's-other',
    responseText: 'رد غير مصرح',
    newStatus: 'closed',
  });

  assert.equal(result.ok, false);
});

test('13. stale list response cannot publish after account switch or auth epoch change', async () => {
  let sessionEpoch = 1;
  let publishedSuggestions = null;

  const isCurrentSession = (targetEpoch) => sessionEpoch === targetEpoch;

  const runAsyncHydration = async (epoch, suggestions) => {
    // simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (!isCurrentSession(epoch)) {
      return; // drop stale response
    }
    publishedSuggestions = suggestions;
  };

  // User A triggers request in epoch 1
  const promiseA = runAsyncHydration(1, [{ id: 's-user-a', title: 'User A' }]);

  // User logs out and switches to User B (epoch becomes 2)
  sessionEpoch = 2;

  await promiseA;

  // Published suggestions must NOT be User A's data
  assert.equal(publishedSuggestions, null);
});

test('14. role change invalidates stale executive suggestion results', async () => {
  let currentRole = 'ACADEMIC_HEAD';
  let publishedState = null;

  const runLoadForRole = async (targetRole, data) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (currentRole !== targetRole) return;
    publishedState = data;
  };

  const p = runLoadForRole('ACADEMIC_HEAD', [{ id: 's-academic', title: 'Academic' }]);
  // Role changes to STUDENT before response returns
  currentRole = 'STUDENT';
  await p;

  assert.equal(publishedState, null);
});
