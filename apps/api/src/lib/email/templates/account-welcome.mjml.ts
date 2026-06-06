export const mjml = `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Inter, Arial, sans-serif" />
      <mj-text font-size="15px" line-height="22px" color="#1f2937" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f8fafc">
    <mj-section background-color="#ffffff" padding="32px">
      <mj-column>
        <mj-text font-size="22px" font-weight="600">Welcome, {{username}}.</mj-text>
        <mj-text>Thanks for joining Tabularium. Your account is ready.</mj-text>
        <mj-button href="{{baseUrl}}/plugins" background-color="#0f172a" color="#ffffff">Browse plugins</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`
