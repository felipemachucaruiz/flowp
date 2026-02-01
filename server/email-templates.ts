export interface EmailTemplateData {
  companyName?: string;
  companyLogo?: string;
  primaryColor?: string;
  language?: string;
}

// Note: Logo images in emails are often blocked by email clients
// Use text fallback when external logo URLs are unavailable
const FLOWP_LOGO_URL = "";

export function getEmailWrapper(content: string, data: EmailTemplateData = {}): string {
  const {
    companyName = "Flowp",
    companyLogo = FLOWP_LOGO_URL,
    primaryColor = "#6E51CD",
  } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${companyName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background-color: #f4f4f5;
      color: #18181b;
      line-height: 1.6;
    }
    
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    
    .header {
      background: linear-gradient(135deg, ${primaryColor} 0%, #8B5CF6 100%);
      padding: 32px;
      text-align: center;
    }
    
    .header img {
      max-height: 48px;
      width: auto;
    }
    
    .header-text {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.5px;
    }
    
    .content {
      padding: 40px 32px;
    }
    
    .content h1 {
      margin: 0 0 24px;
      font-size: 24px;
      font-weight: 600;
      color: #18181b;
    }
    
    .content p {
      margin: 0 0 16px;
      color: #52525b;
      font-size: 16px;
    }
    
    .button {
      display: inline-block;
      background: linear-gradient(135deg, ${primaryColor} 0%, #8B5CF6 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 16px 0;
      transition: transform 0.2s;
    }
    
    .button:hover {
      transform: translateY(-2px);
    }
    
    .info-box {
      background-color: #f4f4f5;
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e4e4e7;
    }
    
    .info-row:last-child {
      border-bottom: none;
    }
    
    .info-label {
      color: #71717a;
      font-size: 14px;
    }
    
    .info-value {
      color: #18181b;
      font-weight: 600;
      font-size: 14px;
    }
    
    .table {
      width: 100%;
      border-collapse: collapse;
      margin: 24px 0;
    }
    
    .table th {
      background-color: #f4f4f5;
      padding: 12px 16px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .table td {
      padding: 16px;
      border-bottom: 1px solid #e4e4e7;
      font-size: 14px;
      color: #18181b;
    }
    
    .table tr:last-child td {
      border-bottom: none;
    }
    
    .total-row {
      background-color: #f4f4f5;
    }
    
    .total-row td {
      font-weight: 700;
      font-size: 16px;
      color: ${primaryColor};
    }
    
    .alert-box {
      background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
      border-left: 4px solid #F59E0B;
      border-radius: 8px;
      padding: 20px 24px;
      margin: 24px 0;
    }
    
    .alert-box.danger {
      background: linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%);
      border-left-color: #EF4444;
    }
    
    .alert-box.success {
      background: linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%);
      border-left-color: #10B981;
    }
    
    .alert-title {
      font-weight: 600;
      color: #18181b;
      margin: 0 0 8px;
    }
    
    .alert-text {
      color: #52525b;
      margin: 0;
      font-size: 14px;
    }
    
    .footer {
      background-color: #18181b;
      padding: 32px;
      text-align: center;
    }
    
    .footer-logo {
      max-height: 32px;
      margin-bottom: 16px;
      filter: brightness(0) invert(1);
    }
    
    .footer p {
      color: #a1a1aa;
      font-size: 12px;
      margin: 0 0 8px;
    }
    
    .footer a {
      color: #a1a1aa;
      text-decoration: none;
    }
    
    .footer a:hover {
      color: #ffffff;
    }
    
    .social-links {
      margin-top: 16px;
    }
    
    .social-links a {
      display: inline-block;
      margin: 0 8px;
    }
    
    .divider {
      height: 1px;
      background-color: #e4e4e7;
      margin: 24px 0;
    }
    
    @media only screen and (max-width: 600px) {
      .content {
        padding: 24px 16px;
      }
      
      .header {
        padding: 24px 16px;
      }
      
      .footer {
        padding: 24px 16px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      ${companyLogo && companyLogo.startsWith('http') ? `<img src="${companyLogo}" alt="${companyName}" style="max-height: 60px; max-width: 200px;" />` : `<h1 class="header-text">${companyName}</h1>`}
    </div>
    
    <div class="content">
      ${content}
    </div>
    
    <div class="footer">
      <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAIAAADdvvtQAAAACXBIWXMAAAsSAAALEgHS3X78AAAW8ElEQVR4nO2dWXQTV5qAf0u2FtuSyra84EUSGBuCiWWykDQJFoTQySy2yJn09JmZbuyQMH36HLbk5DHAAfI2SVjCS6cZwCZz+nQ6nWAz3aezdLDUkExndYmQYGywJC94l0r7gqx5kDGyLGsrqeqWfL8HsMStqt/Sx723bt3735xgMAjR8FtnRy66Ri86Lb0+l+nu/PtBWFA+mHP/x/B/CN77Y+GbwYUFFhwVBICcxecJxiofdokgAOQsuOJSxy6OLQhByEms2P3LBQHg3lHBqGUiTjX3Zk608ywss3T5aAXCL5oTpcDCX2RhgZzov1foX4sU4upGibqlTN1aJpblQTRyFgvkt872n6D6T9j81GzYZ7Eg1vsvsUCRUWWPQPMlxVL+1r2qbXuUizWKFGiyx/NV+5TL5J9/BwuEBQqVLFaI2955sH5zMYTBC39hOu/QbR0Lb7AwmHlmzO63nv37F++OhL95XyDTecfXL0wxHhWGY3T8yvB5mENzAk32eLA9mATp+JXh5t9mQj/zAMBvnf26HduDSYLz/2lwUX4ICdR/wob7PZikmDa7/3raCAA8v3V24ISN7Xgw3OPT04Muys8bvegKjfdgMEnhtt3tvTTOG73oYjsSDFfpvTTOs/b62A4Dw1WGDDYe7j5jUmba7ObFL4XBLA0WCEMLLBCGFlggDC2wQBhaYIEwtMACYWiBBcLQAguEoQUWCEMLLBCGFlggDC2wQBhaYIEwtMACYWiBBcLQAguEoQUWCEMLLBCGFrlsB4AWUqVAoprLYBIEqNYUhn6wGb02ky+UrcJjvTtJutmLES2Wr0ASlUCuFsnVYnmTWEDwqpoLkzrcSwUmSRdl8k2QriGdfZxcpqujct6HwfDXwYi/sys/UIlaVLmlsFJTUKUpEMj4kD68VKC/2/p955RZZ1scbXbkB4paclkIpNJKVVrpSq0kvdJExWb2XTk6cq1zKjxaLFB4Ac4ItEKTv6atSMWINxFMGFx/enFwgnRigbgnUB7BX9NGPLivpFAZPS8kY/z5pduGzinIaoGyqhMtUeU9dKiMlSonKv94ZlUQ4F5zlp1kiUASVd6Gw6X1Owm2A4nk6TeVE6RrLHvv0Tg/kCgg+I8fr/j5rToE7QEAoYy/7U0l21FkEG4L1LC/+Oe369bvK45flD0UzRKFRsp2FJmCq01YcZOo+eyKYrWI7UASYuO+crOOYjuKjMBJgTYcLt1wSM52FEmgaMY1EBoUqvK2fVDNlYpnHmFid4WEUmgxeTMdTHrhUh9IoZVov13FOXsSR0Tktn+yXkRw6X81ZwR67Hj5tg+qBDLOBJwCY6SzQl1w4ObDqmYZ27EkCge+DwHBf+rD6nX7itgOJHUmDImOAxn1lFDGb/+k4dk3V2Y0pHSBukACgv/sZwpFa3JzLVDDkPBg9BjpDP3w+J7KX3/VRCiFGQsqPSAtUHGTsPVbVbEa9Q8xNpTZe61zMoUDKxoLfv3VBsS7ROgKVNwkfOYzBesPROnzpxcHPdZAaseKZPznfluX3njSC6IChezJgi7zlWMjoSlmCbK4zVrbUrwS4T41it9Q1tjz/YWpK8dG4pcLQ6WJ4sqGneVpiij9INe+CgjeE2dXZIE9f35pMNmuj6pZJlNE6fCtbUH3YR9a35OA4D3zmYLrvWab2fe77TdSmAakOVgT9X2RLLdCXUA7royAVg30xLmKIo7b883b41eOjaTQa1bvLFUu/chMLEPrm5oHobDUh0tquDzeM6S3Xz02mlSXeZ4KdcGzb3Bj5DACVASq2VGoPlzCdhQpMmlwXT062t9tTe3wCnXBzk8aYj9wRfYhKxICFarynjhXwXYUqTCst189dmdIZwvGLxsd9c7SZ95YGdseq9lrNXlSvUJmQUKgTecq8jh122Uz+Qa6rd+cHLeZfSmrIyJyW8/U1rfEf8b3Xed4qhfJOOwL9MCBonKNmO0oEsJm8g3r7APd1ECXdW45Tk68Y6IhInI37q3YuHdFIvOEPFTgi9OjqVyGEVgWqFCV98hbpezGEJdhveNWFzWss0+QLli0UC4pZEphY1vpxr0VCU4xA4APd/d7rOhuCsiyQD9BteszoncM6xzDOvuwzkHHmHnqW4sebCtNpMEKp+f1oRvd0zEKPH9mzf++estt9dOLLnXYFKi2XYpO4+WjAsM6x4jOOaKzT5BuCFvQmTIypbBGI6nXFimapYlXOfP0Xpi4fMwco5Xc9pryoV+Ue6x3L706QCdOOrAmkIDgPXKc/cZrsNs2onMM9zimDO7Fy7pToEydX6bOV2gkCo1UqhCkfJ6/vDr4xduxuj5FStETe6sAYNOeqitvD1tYuk1jTaC1+4vYuvPyUYHBLtvtLup219ygXxCCqXWHazQSgYxfphaXNeVLlYKyxnz64XmpwO+ev2HUxxlV+pcza0T3hqf/+Y3aCz+7Tv/SKcCOQAWqvAcOML2Q1EcFbnRY+josk6QnqWomlKdMqhRIVQIAqNZIAKA6yYRUCdJ3aebiSwPueL3mTXurVm6+/9x+XYt8VTNxK55zmYAdgRoPFzNZ/YzqnX0d1r6OmajWSFQCiTIPcqBKUwgAQoInV4shlO5OmXoblCyU2dv14sCgPv76wxXqgn/6r1URbz59UHlr+/IQqECVt6qNoYV2dpP/81fuDHbZAKBSUyAg+HK1OAhQtaUAAORqEQp5PCizV3dsqLdzMpF6sUgpevHjxsXvr9xMrGombv/NkoEAY8GCQGv3M9d43dE5G/eXbD1bhYIoiwmpQyY8bUhE5P7HH9aJlngy//RB5Ts/zXaBBASvtp25db5opuwAAMOFSbJz0qS3BRPujYmI3Bc/frCiccmJQas2E0VK0Qyzt2NMC7SqXcqtx17pZcLgMnROkhcmPda7SY0WiIjcXTHtCfH0a6r3dt+gE2GyMC3Q2v0cXh+YMiFv+roslMk7n7IucRK0BwAaWuRiWa6bYu7RB6MClW8RFyjZf3zLDBMGl1lnM+vsZr3NbQ1E5H5MnAp1wb/94QEi2lzpxYhkuQ2t8q8vjKV0qVRg9Otk7OaLFbxUYIJ0mXX2Ib1tjHR5aUgzz9rWkufO1ImSuQNoaMlegWp2cHjGagQ2k89m8k6QbsrknSBd43PGLMhjSpN/eHPl43sqkz1qXYucya40cwJV7yjgaPd5WO8AgGGdAyA4pHOE9sqYnw8UkXE3LVSoC3acWZ1Ipycqtc3EDFOVEIMCaZGufuwmn83ksxl9dpPPYw1MkW6PNTC5cAJQGmuXGGw5WKN5Lfr6ngRpaJF/lX0C1exAZWXTlMHjswZGehxeKjDV67GZfDaj915dAgsTbDOKqlmm/e/VUdcWJsW6Fuby/zEkUFGTkMVn71OkZ7TOOK26bUbfFOmJmkWfXZTNUs3BmhjrwpKloUV+/VIqKUGShSGByrcwOnFs2uC50+Mc0TmnSY/d6IuoWpAi7eqEqG0mskqgam3G2y+HyT+qc5q6bCM6ly/shghZ1rQWb9xbkXZ1QlSqGepxMteEZejMDpPf2GXv77BO9XoidutBE5lSWN9atHFfBf2+TgxWbWboISATAmWoA9TfSfWft97RORE3JoSI4Ne1Ftdri5KdV58ytc3EQOanmDEhUIEqnVdxmPz9HdT1kzOhod40njkTiAh+XWtRvbaojilv5ilSMpEPmZEaKE0JNxwmf++RyZsdHNgzQKGR1LUWKTSStMySTo3KRglAxkeDmBCI/i2Yj5r98uXx/g4K2SontBijTC2uYVWacJjpRzMhUB5BqwP0wylL75Epb6p5KjNBqVosVQnK1PmlTWKZUljaiMrqtnBwEwYzpPfKrjszvawlphAS/FK1WEDwS9X5oVUZUqVAyuBMezoUKbJFoNQgj073HplibCxHrhYLCH61phAgGFqekexO8gjCwOSyjAuUQgfIR81efm5kTJfBbSKrNIXyJpFAxq/aUihR5jG5fIdJKtWFmV4shlwNZJlrttKZkEtI8EvUokpNQUmTSK4WS7ifvBwd0BLIQno/esrstc7SP5WA4K/Q5FdqCiq3FJQ0Zu0OUayDkEAW0vvRU0M+evZIVHlKrVSllaxoRmX2SAy8VAAS3o4OTTIuUFliCVwspPejrUM+KkV7BAS/rk1W307worLxUoG+7pm+bouI4Lf8tjZzF6ptLloWfSAL6f1465DPOptCiowVmoK6dlkdqgsIw6HM3ptdFpPe1tc9AwCbD1Y3v1bNdlB0YV8gPzXb89xoCi1XXZusvo2o0CAx7BuDCYPLpLNd65wcI10AADkgInK3v6Fs/CX76ZHow75Al58bdRiTy9C2QpP/2PFylDdP9VIBs97e3zVj0tkpkzc82Vm5Ov/59+szOpdjnrhpYuiTcYEmdO4Y/2o4Mj3ek8R4T6Eqb/PZSmRrnSG9PbQuzKSzA0DEHEgRwX9074rNB6sYi2fUYM/0JdisgSyk13AkVgbJCDYcljchtl18aDHhkM5u1tuHdHZYehpk487SJw9VMVPxMAmbAn3+QqL5swtVeU99UI3CLj6TBrfN6AtJQxm99xKNx5ptrdBInzxYpWiWMBUjo7Am0O0OmyWx4eYKTf5TH1azsoPYiN5hM/ook29YZ/daA+F5ohNJNP7gTvn6naXZqk6IjAs03hOlD+SnZr9+OaE1A6vbZE+eXZHuoKIzZXBP9rrtJt+wbs6b1Fb/CAn++p3yR/dV0MnSmhYYyJrITg1044Q1kfv21W2yJ85mMBP5lMEz0uOYIt2Tve7wNL8pTwCo0UjW7yxZ/0u0OmoZhQmBLKQ3YkrQrY74m2plyJ5RvXOkxzmqc4yEpaBPOc1vCJlS2LCzZH2bnPUqJ5w7BgcDV2FCIP/CyuZ2h80Zb+CnuEmYRnt8VGCwy27sokZ0Tq81QD8FfQghwV/fVtKwU47mjERm0kwxIdB4jzv8idjteNVPaOfUtFza2G3r67AOziUUT8/KVCHBX91K1Gplq1uRfn7CTNpoJgRymu6G/xy1Wx3Ok+fo7trsowLXTs70dVrsRh+d84QjJPi1rbJaLVHbiu4u7uFYTHE+57TASB8o7HZ96GKchrlGW0hn59SQOtdOTfusgbRMhxUS/FWc8maeUTJb+kCWXq+fmg0tTh3uivNbbTxelvKFvj06ee3UdLrWb9RqZbWtslVaGRfn63iou6NZ04kGgPEedyi/Quz2q7ZNWpDSfNMZ0tOza3SaTEOlLVUK1PtLa1tlnJ4ozYw9wJhAw13Oam1B7AerALAupSTA/Z3WL14e91oDdG7FAWCVVta0T54FizGAqR40MCfQRQecLYtd/RQ3CVNYQfZ/r4x9f3KGRmgAAA+0FW88VM7pKieC21kmkM86O6FzO0yxhn9qk08CrN812t9B65Na21aUZeoAgIe6m201EAAMdzljjx9WbElulg9Ne1ZqpU++VZll6oS4fmmKsWsxJ9DQRWeM+2oBwUuq/bp+aqY/1TQdEpVg29nqSi4s20gNxtovYFIgp9EfQ6CipiTmp47pXH9/OdG5RBE07pc/eqgMzd2f0sX17mysgWJTkfD2zT5qVr8r1m60SyEk+FvOVq9szebtFgDgm3fHsnazlbTw3ZHJZCfhA4BcLdp6rpoTq8ZowmT1A+gIVJ5YD9ph8l9P/qZdrha1frYyu5utEBazh8keNABwbPOK3iNJ5z4uWTb2AMA3DO7TE4JLAoXSayZ1iIDgLx97AAsUm4Hk79uXlz3vjluY3TAV0BHIl8Aj9GSrn0cOlS2HXvM8nx4zMn9RVASKu8RnhvQmdfMlUeU9fCj1mSGc41s2qh9AR6C4iV2SzXi35SxzK4hRgJXqB9ARKG5Ou6RytVZqCjiRYCpdsFX9ADoCWeL5YU+m/apvQ3q6e3rxUHfZqn4AHYF81lkLGasSSrwJExD8ei7km0oXV98eYav6AXQEAoCxZPK8xEClzea16BFYzZ6rp0dYDAAhgYa6nGk5j0qb5Y9Lw3n/pZuezGeRigFCAo31uJwxpywmSCWq6afSzuenR5ic+hMVhAQCAHO8RT9xERD8ZTL0bDV7Pn3dxHYUiAn040m6/59KEE6cmF5Yb7xCoCWQw+i/1UlrPzkhva2luMJnr5sH2W68QiD3cd86Hz31QoKJNUvUKCbKSC8/Xpr+KwKNVwjkBBrTuaJWQhIV3iEFAGDM4Pzj7ptsR3Ef5AQCgN5oqVuLk5l1n614qLt/3N2HQtdnHhQFchj95NFIh5DNDc0YHuru2Z8a7pDpGS1LFygKBAC9R6ZmFj7ZKFYLBUT8+/O05FdAkw9296NmDyArEABc3XUnYo6HUhs/7UFa9hpDkA939//YnURSdsZAV6CZXu9XL0+Ev6PYEf8h1zTJ2mPFzPHh7v7vLqS4kDLToCsQAAx0UANhd2SK1sLCePdiPmvARyG0QThNPFTgIsL2AOICAcCVF+6EO1SXwESf0Uzu1sskHipwbvu17y5MxC/KHqgLBABXXrjz5StzH+K6/cVxu9J3dMj1NFNgzOA8t/3aGHq95gg4IBAA/HByputho8PkF8h4DfuLYxc2dsXPYo44Rr3t/Pbv0bcHuCIQAMz0eroeMpq77Q3xKiG70T9t4HBXWvf60Pnt3yM1WhgD/r/CAVonoJeWMKmzBTzBwd/bAp5gXTth7oq2ldq9w3NFvJpnuJfq0EsF/qflx96ITk9Sn3CyX0fi5ZcomfM+DIa/Dkb8vWhPgIgcP8H7512QB35+O4GFby4+bTAY/k7O4vMEF5cvVOU5jP6ISwQBIGfupYDg//utOm5NDOq7NNP10kBok8oFe5DlzH0I4W9GbFJ2v0BOlAILP6iFBXIWHg5LX2uJkpxpwsKJu8LQZw1co515kzEos/e9n/X9/nm0HnIlCCcFSoRrp6bt6Zggm2n0rw+/86ghtBE4F8lagXzWQM+uYbajiMXNS5bT9d/pjg1xseKZJ2sFAoBRnfOboyiOwpn1tne3//De831WU0KbfqIMKhnKMsTXRyckKgE66wyvXZgydE4a9bSm7SJFlgsEAJd3DQcB1rDqkJcKGDonvzw1Rpm8aR74YJvsFwgALu8anibdm95kaPPecPovWa51TPV1W9K13R1qLAuBAMBwcnq0x7HpeCUD+cW9VKC/23Kzy2rWU5407T2FLJwcSIx6ifCBxBjHytWixv3ylVppeocZbWbfBOky6+xmnW2CdEVEu/TAYESQccsjN5C47ASaP1CuFpc0ieRqcWmTWK4WJeWTzeSzmbwTpNtm8o6T7gnSOV/TBBf81tkv0HJpwhYzRbonSTeABUKfRQ7I1WIBwQ99PhKlQKoSAIDXGpgg5yYYBQGGdfYFX3zO/a9nebJ8BVrM5NyE/Kj/cUMvlq8oS5HNA4kYBsACYWiBBcLQAguEoQUWCEMLLBCGFlggDC2wQBhaYIEwtMACYWiBBcLQAguEoQUWCEMLLBCGFlggDC2wQBhaYIEwtMACYWiBBcLQgpevxNOiMSlSohDziCYB22FguEpNo5RXuWO570GBSZmmlnJe5Y78PBnuCWGSRizNbWop5+URvNUHltE2x5h08fSelfmyPB4A1B2Q4q40JilKFOJte1QQuo3PI3iPnJezHBGGU7S/05gvy4P5caDSLaJHzmGHMAnR9pvG+s1z+wXc7z4r2wuxQ5i4tP2mcdMvquZfLrj/UrYXai5X4P4QJirFCvErf3nsJ2H2AEBOcFHmNb91tv8E1X/C5qdmIXvzA0WWzEmsWERen3vpXaKWyZr8QGIpf+te1bY9SrEscr+2KAKF8FtnRy66Ri86Lb0+l+l+ImMs0PIRqEghrm6UqFvK1K1li9UJ8f+uQML4UsaaQQAAAABJRU5ErkJggg==" alt="Flowp" style="height: 40px; margin-bottom: 8px;" />
      <p>Powered by Flowp - Modern POS & Inventory Management</p>
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

export interface PasswordResetTemplateData extends EmailTemplateData {
  userName: string;
  resetUrl: string;
}

export function getPasswordResetTemplate(data: PasswordResetTemplateData, language: string = "en"): { subject: string; html: string } {
  const translations: Record<string, any> = {
    en: {
      subject: "Reset Your Password",
      title: "Password Reset Request",
      greeting: `Hello ${data.userName},`,
      message: "You requested to reset your password. Click the button below to set a new password:",
      button: "Reset Password",
      expiry: "This link will expire in 1 hour.",
      ignore: "If you didn't request this, please ignore this email. Your password will remain unchanged.",
      security: "For your security, this request was received from your account.",
    },
    es: {
      subject: "Restablecer tu Contraseña",
      title: "Solicitud de Restablecimiento",
      greeting: `Hola ${data.userName},`,
      message: "Solicitaste restablecer tu contraseña. Haz clic en el botón a continuación para establecer una nueva:",
      button: "Restablecer Contraseña",
      expiry: "Este enlace expirará en 1 hora.",
      ignore: "Si no solicitaste esto, ignora este correo. Tu contraseña permanecerá sin cambios.",
      security: "Por tu seguridad, esta solicitud fue recibida desde tu cuenta.",
    },
    pt: {
      subject: "Redefinir sua Senha",
      title: "Solicitação de Redefinição",
      greeting: `Olá ${data.userName},`,
      message: "Você solicitou a redefinição de sua senha. Clique no botão abaixo para definir uma nova:",
      button: "Redefinir Senha",
      expiry: "Este link expirará em 1 hora.",
      ignore: "Se você não solicitou isso, ignore este e-mail. Sua senha permanecerá inalterada.",
      security: "Para sua segurança, esta solicitação foi recebida de sua conta.",
    },
  };

  const t = translations[language] || translations.en;

  const content = `
    <h1>${t.title}</h1>
    <p>${t.greeting}</p>
    <p>${t.message}</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.resetUrl}" class="button">${t.button}</a>
    </div>
    <div class="alert-box">
      <p class="alert-title">⏱️ ${t.expiry}</p>
      <p class="alert-text">${t.ignore}</p>
    </div>
    <p style="font-size: 12px; color: #71717a;">${t.security}</p>
  `;

  return {
    subject: t.subject,
    html: getEmailWrapper(content, data),
  };
}

export interface OrderConfirmationTemplateData extends EmailTemplateData {
  orderId: string;
  orderTotal: string;
  items: Array<{ name: string; quantity: number; price: string }>;
  subtotal?: string;
  tax?: string;
  customerName?: string;
}

export function getOrderConfirmationTemplate(data: OrderConfirmationTemplateData, language: string = "en"): { subject: string; html: string } {
  const translations: Record<string, any> = {
    en: {
      subject: `Order Confirmation - #${data.orderId}`,
      title: "Thank you for your order!",
      orderNumber: "Order Number",
      item: "Item",
      qty: "Qty",
      price: "Price",
      subtotal: "Subtotal",
      tax: "Tax",
      total: "Total",
      message: "We've received your order and it's being processed. You'll receive another email when your order is ready.",
      questions: "Have questions? Contact us anytime.",
    },
    es: {
      subject: `Confirmación de Pedido - #${data.orderId}`,
      title: "¡Gracias por tu pedido!",
      orderNumber: "Número de Pedido",
      item: "Artículo",
      qty: "Cant.",
      price: "Precio",
      subtotal: "Subtotal",
      tax: "Impuesto",
      total: "Total",
      message: "Hemos recibido tu pedido y está siendo procesado. Recibirás otro correo cuando tu pedido esté listo.",
      questions: "¿Tienes preguntas? Contáctanos en cualquier momento.",
    },
    pt: {
      subject: `Confirmação de Pedido - #${data.orderId}`,
      title: "Obrigado pelo seu pedido!",
      orderNumber: "Número do Pedido",
      item: "Item",
      qty: "Qtd.",
      price: "Preço",
      subtotal: "Subtotal",
      tax: "Imposto",
      total: "Total",
      message: "Recebemos seu pedido e ele está sendo processado. Você receberá outro e-mail quando seu pedido estiver pronto.",
      questions: "Tem perguntas? Entre em contato conosco a qualquer momento.",
    },
  };

  const t = translations[language] || translations.en;

  const itemsHtml = data.items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">${item.price}</td>
    </tr>
  `).join("");

  const content = `
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; background: linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2">
          <polyline points="20,6 9,17 4,12"></polyline>
        </svg>
      </div>
      <h1 style="margin: 0;">${t.title}</h1>
    </div>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">${t.orderNumber}</span>
        <span class="info-value">#${data.orderId}</span>
      </div>
    </div>
    
    <table class="table">
      <thead>
        <tr>
          <th>${t.item}</th>
          <th style="text-align: center;">${t.qty}</th>
          <th style="text-align: right;">${t.price}</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
        <tr class="total-row">
          <td colspan="2" style="text-align: right;">${t.total}</td>
          <td style="text-align: right;">${data.orderTotal}</td>
        </tr>
      </tbody>
    </table>
    
    <p>${t.message}</p>
    <p style="font-size: 14px; color: #71717a;">${t.questions}</p>
  `;

  return {
    subject: t.subject,
    html: getEmailWrapper(content, data),
  };
}

export interface PaymentReceivedTemplateData extends EmailTemplateData {
  amount: string;
  paymentMethod: string;
  transactionId?: string;
  date?: string;
}

export function getPaymentReceivedTemplate(data: PaymentReceivedTemplateData, language: string = "en"): { subject: string; html: string } {
  const translations: Record<string, any> = {
    en: {
      subject: "Payment Received",
      title: "Payment Successful!",
      message: "We've received your payment. Here are the details:",
      amount: "Amount",
      method: "Payment Method",
      transaction: "Transaction ID",
      date: "Date",
      thankYou: "Thank you for your business!",
    },
    es: {
      subject: "Pago Recibido",
      title: "¡Pago Exitoso!",
      message: "Hemos recibido tu pago. Aquí están los detalles:",
      amount: "Monto",
      method: "Método de Pago",
      transaction: "ID de Transacción",
      date: "Fecha",
      thankYou: "¡Gracias por tu preferencia!",
    },
    pt: {
      subject: "Pagamento Recebido",
      title: "Pagamento Bem-sucedido!",
      message: "Recebemos seu pagamento. Aqui estão os detalhes:",
      amount: "Valor",
      method: "Método de Pagamento",
      transaction: "ID da Transação",
      date: "Data",
      thankYou: "Obrigado pela sua preferência!",
    },
  };

  const t = translations[language] || translations.en;

  const content = `
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; background: linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2">
          <polyline points="20,6 9,17 4,12"></polyline>
        </svg>
      </div>
      <h1 style="margin: 0;">${t.title}</h1>
    </div>
    
    <p>${t.message}</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">${t.amount}</span>
        <span class="info-value" style="color: #10B981; font-size: 18px;">${data.amount}</span>
      </div>
      <div class="info-row">
        <span class="info-label">${t.method}</span>
        <span class="info-value">${data.paymentMethod}</span>
      </div>
      ${data.transactionId ? `
      <div class="info-row">
        <span class="info-label">${t.transaction}</span>
        <span class="info-value">${data.transactionId}</span>
      </div>
      ` : ""}
      ${data.date ? `
      <div class="info-row">
        <span class="info-label">${t.date}</span>
        <span class="info-value">${data.date}</span>
      </div>
      ` : ""}
    </div>
    
    <p style="text-align: center; font-size: 18px; font-weight: 600; color: #18181b;">${t.thankYou}</p>
  `;

  return {
    subject: t.subject,
    html: getEmailWrapper(content, data),
  };
}

export interface LowStockAlertTemplateData extends EmailTemplateData {
  productName: string;
  currentStock: number;
  minStock?: number;
  sku?: string;
}

export function getLowStockAlertTemplate(data: LowStockAlertTemplateData, language: string = "en"): { subject: string; html: string } {
  const translations: Record<string, any> = {
    en: {
      subject: `Low Stock Alert: ${data.productName}`,
      title: "Low Stock Alert",
      message: "The following product is running low on stock and may need restocking soon:",
      product: "Product",
      sku: "SKU",
      currentStock: "Current Stock",
      minStock: "Minimum Stock",
      action: "Please review your inventory and consider placing a reorder to avoid stockouts.",
      reorder: "Reorder Now",
    },
    es: {
      subject: `Alerta de Stock Bajo: ${data.productName}`,
      title: "Alerta de Stock Bajo",
      message: "El siguiente producto tiene stock bajo y puede necesitar reabastecimiento pronto:",
      product: "Producto",
      sku: "SKU",
      currentStock: "Stock Actual",
      minStock: "Stock Mínimo",
      action: "Por favor revisa tu inventario y considera hacer un pedido para evitar desabastecimiento.",
      reorder: "Reordenar Ahora",
    },
    pt: {
      subject: `Alerta de Estoque Baixo: ${data.productName}`,
      title: "Alerta de Estoque Baixo",
      message: "O seguinte produto está com estoque baixo e pode precisar de reabastecimento em breve:",
      product: "Produto",
      sku: "SKU",
      currentStock: "Estoque Atual",
      minStock: "Estoque Mínimo",
      action: "Por favor, revise seu inventário e considere fazer um pedido para evitar falta de estoque.",
      reorder: "Reordenar Agora",
    },
  };

  const t = translations[language] || translations.en;

  const content = `
    <div class="alert-box danger">
      <p class="alert-title" style="font-size: 18px;">⚠️ ${t.title}</p>
      <p class="alert-text">${t.message}</p>
    </div>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">${t.product}</span>
        <span class="info-value">${data.productName}</span>
      </div>
      ${data.sku ? `
      <div class="info-row">
        <span class="info-label">${t.sku}</span>
        <span class="info-value">${data.sku}</span>
      </div>
      ` : ""}
      <div class="info-row">
        <span class="info-label">${t.currentStock}</span>
        <span class="info-value" style="color: #EF4444; font-size: 18px; font-weight: 700;">${data.currentStock}</span>
      </div>
      ${data.minStock ? `
      <div class="info-row">
        <span class="info-label">${t.minStock}</span>
        <span class="info-value">${data.minStock}</span>
      </div>
      ` : ""}
    </div>
    
    <p>${t.action}</p>
  `;

  return {
    subject: t.subject,
    html: getEmailWrapper(content, data),
  };
}

export interface TransactionReceiptTemplateData extends EmailTemplateData {
  receiptNumber: string;
  date: string;
  items: Array<{ name: string; quantity: number; price: string }>;
  subtotal: string;
  tax: string;
  total: string;
  paymentMethod: string;
  cashier?: string;
  storeName?: string;
}

export function getTransactionReceiptTemplate(data: TransactionReceiptTemplateData, language: string = "en"): { subject: string; html: string } {
  const translations: Record<string, any> = {
    en: {
      subject: `Receipt #${data.receiptNumber}`,
      title: "Your Receipt",
      receiptNo: "Receipt #",
      date: "Date",
      item: "Item",
      qty: "Qty",
      price: "Price",
      subtotal: "Subtotal",
      tax: "Tax",
      total: "Total",
      paymentMethod: "Payment Method",
      cashier: "Cashier",
      thankYou: "Thank you for your purchase!",
      visitAgain: "We look forward to seeing you again soon.",
    },
    es: {
      subject: `Recibo #${data.receiptNumber}`,
      title: "Tu Recibo",
      receiptNo: "Recibo #",
      date: "Fecha",
      item: "Artículo",
      qty: "Cant.",
      price: "Precio",
      subtotal: "Subtotal",
      tax: "Impuesto",
      total: "Total",
      paymentMethod: "Método de Pago",
      cashier: "Cajero",
      thankYou: "¡Gracias por tu compra!",
      visitAgain: "Esperamos verte pronto de nuevo.",
    },
    pt: {
      subject: `Recibo #${data.receiptNumber}`,
      title: "Seu Recibo",
      receiptNo: "Recibo #",
      date: "Data",
      item: "Item",
      qty: "Qtd.",
      price: "Preço",
      subtotal: "Subtotal",
      tax: "Imposto",
      total: "Total",
      paymentMethod: "Método de Pagamento",
      cashier: "Caixa",
      thankYou: "Obrigado pela sua compra!",
      visitAgain: "Esperamos vê-lo novamente em breve.",
    },
  };

  const t = translations[language] || translations.en;

  const itemsHtml = data.items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">${item.price}</td>
    </tr>
  `).join("");

  const content = `
    <h1 style="text-align: center;">${t.title}</h1>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">${t.receiptNo}</span>
        <span class="info-value">${data.receiptNumber}</span>
      </div>
      <div class="info-row">
        <span class="info-label">${t.date}</span>
        <span class="info-value">${data.date}</span>
      </div>
      ${data.cashier ? `
      <div class="info-row">
        <span class="info-label">${t.cashier}</span>
        <span class="info-value">${data.cashier}</span>
      </div>
      ` : ""}
    </div>
    
    <table class="table">
      <thead>
        <tr>
          <th>${t.item}</th>
          <th style="text-align: center;">${t.qty}</th>
          <th style="text-align: right;">${t.price}</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
    
    <div class="info-box" style="background: linear-gradient(135deg, #f4f4f5 0%, #e4e4e7 100%);">
      <div class="info-row">
        <span class="info-label">${t.subtotal}</span>
        <span class="info-value">${data.subtotal}</span>
      </div>
      <div class="info-row">
        <span class="info-label">${t.tax}</span>
        <span class="info-value">${data.tax}</span>
      </div>
      <div class="info-row" style="border-bottom: none;">
        <span class="info-label" style="font-size: 18px; font-weight: 700; color: #18181b;">${t.total}</span>
        <span class="info-value" style="font-size: 24px; color: #6E51CD;">${data.total}</span>
      </div>
    </div>
    
    <div class="info-box">
      <div class="info-row" style="border-bottom: none;">
        <span class="info-label">${t.paymentMethod}</span>
        <span class="info-value">${data.paymentMethod}</span>
      </div>
    </div>
    
    <div style="text-align: center; margin-top: 32px;">
      <p style="font-size: 18px; font-weight: 600; color: #18181b; margin-bottom: 8px;">${t.thankYou}</p>
      <p style="color: #71717a;">${t.visitAgain}</p>
    </div>
  `;

  return {
    subject: t.subject,
    html: getEmailWrapper(content, data),
  };
}

export interface WelcomeEmailTemplateData extends EmailTemplateData {
  userName: string;
  businessName: string;
  loginUrl?: string;
}

const welcomeTranslations = {
  en: {
    subject: "Welcome to Flowp POS!",
    title: "Welcome to Flowp!",
    greeting: "Hello",
    intro: "Thank you for registering your business with Flowp POS. Your account is now ready to use!",
    businessLabel: "Business Name",
    getStarted: "Here's how to get started:",
    step1: "Add your products and categories",
    step2: "Configure your tax rates and payment methods",
    step3: "Invite your team members",
    step4: "Start making sales!",
    loginButton: "Go to Dashboard",
    support: "If you have any questions, our support team is here to help.",
    thanks: "Best regards,",
    team: "The Flowp Team",
  },
  es: {
    subject: "¡Bienvenido a Flowp POS!",
    title: "¡Bienvenido a Flowp!",
    greeting: "Hola",
    intro: "Gracias por registrar tu negocio en Flowp POS. ¡Tu cuenta está lista para usar!",
    businessLabel: "Nombre del Negocio",
    getStarted: "Así puedes comenzar:",
    step1: "Agrega tus productos y categorías",
    step2: "Configura tus tasas de impuestos y métodos de pago",
    step3: "Invita a los miembros de tu equipo",
    step4: "¡Comienza a vender!",
    loginButton: "Ir al Panel",
    support: "Si tienes alguna pregunta, nuestro equipo de soporte está aquí para ayudarte.",
    thanks: "Saludos cordiales,",
    team: "El Equipo de Flowp",
  },
  pt: {
    subject: "Bem-vindo ao Flowp POS!",
    title: "Bem-vindo ao Flowp!",
    greeting: "Olá",
    intro: "Obrigado por registrar seu negócio no Flowp POS. Sua conta está pronta para uso!",
    businessLabel: "Nome do Negócio",
    getStarted: "Veja como começar:",
    step1: "Adicione seus produtos e categorias",
    step2: "Configure suas taxas de impostos e métodos de pagamento",
    step3: "Convide os membros da sua equipe",
    step4: "Comece a vender!",
    loginButton: "Ir para o Painel",
    support: "Se você tiver alguma dúvida, nossa equipe de suporte está aqui para ajudar.",
    thanks: "Atenciosamente,",
    team: "A Equipe Flowp",
  },
};

export function getWelcomeEmailTemplate(data: WelcomeEmailTemplateData, language: string = "en"): { subject: string; html: string } {
  const t = welcomeTranslations[language as keyof typeof welcomeTranslations] || welcomeTranslations.en;
  const loginUrl = data.loginUrl || "https://pos.flowp.app/login";

  const content = `
    <h1>${t.title}</h1>
    <p>${t.greeting} ${data.userName},</p>
    <p>${t.intro}</p>
    
    <div class="info-box">
      <div class="info-row" style="border-bottom: none;">
        <span class="info-label">${t.businessLabel}</span>
        <span class="info-value">${data.businessName}</span>
      </div>
    </div>
    
    <p><strong>${t.getStarted}</strong></p>
    <ol style="color: #52525b; padding-left: 24px;">
      <li style="margin-bottom: 8px;">${t.step1}</li>
      <li style="margin-bottom: 8px;">${t.step2}</li>
      <li style="margin-bottom: 8px;">${t.step3}</li>
      <li style="margin-bottom: 8px;">${t.step4}</li>
    </ol>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${loginUrl}" class="button">${t.loginButton}</a>
    </div>
    
    <p>${t.support}</p>
    <p>${t.thanks}<br/>${t.team}</p>
  `;

  return {
    subject: t.subject,
    html: getEmailWrapper(content, data),
  };
}

export interface NewSaleNotificationTemplateData extends EmailTemplateData {
  orderNumber: string;
  total: number;
  itemCount: number;
  paymentMethod: string;
  customerName?: string;
  cashierName?: string;
  currency?: string;
}

export function getNewSaleNotificationTemplate(data: NewSaleNotificationTemplateData, language: string = "en"): { subject: string; html: string } {
  const translations: Record<string, any> = {
    en: {
      subject: `New Sale: #${data.orderNumber}`,
      title: "New Sale Completed",
      message: "A new sale has been completed at your store:",
      orderNumber: "Order #",
      total: "Total",
      items: "Items",
      paymentMethod: "Payment Method",
      customer: "Customer",
      cashier: "Cashier",
      walkIn: "Walk-in Customer",
      viewDetails: "View Order Details",
    },
    es: {
      subject: `Nueva Venta: #${data.orderNumber}`,
      title: "Nueva Venta Completada",
      message: "Se ha completado una nueva venta en tu tienda:",
      orderNumber: "Pedido #",
      total: "Total",
      items: "Artículos",
      paymentMethod: "Método de Pago",
      customer: "Cliente",
      cashier: "Cajero",
      walkIn: "Cliente Sin Registro",
      viewDetails: "Ver Detalles del Pedido",
    },
    pt: {
      subject: `Nova Venda: #${data.orderNumber}`,
      title: "Nova Venda Concluída",
      message: "Uma nova venda foi concluída em sua loja:",
      orderNumber: "Pedido #",
      total: "Total",
      items: "Itens",
      paymentMethod: "Método de Pagamento",
      customer: "Cliente",
      cashier: "Caixa",
      walkIn: "Cliente Avulso",
      viewDetails: "Ver Detalhes do Pedido",
    },
  };

  const t = translations[language] || translations.en;
  const currency = data.currency || 'USD';
  const currencySymbol = currency === 'COP' ? '$' : currency === 'EUR' ? '€' : '$';

  const content = `
    <h1 style="color: #18181b; margin: 0 0 16px 0; font-size: 24px; font-weight: 600;">${t.title}</h1>
    <p style="margin: 0 0 24px 0; color: #52525b;">${t.message}</p>
    
    <div style="background-color: #f4f4f5; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #71717a; font-size: 14px;">${t.orderNumber}</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${data.orderNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #71717a; font-size: 14px;">${t.total}</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #16a34a; font-size: 18px;">${currencySymbol}${data.total.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #71717a; font-size: 14px;">${t.items}</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 500;">${data.itemCount}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #71717a; font-size: 14px;">${t.paymentMethod}</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 500; text-transform: capitalize;">${data.paymentMethod}</td>
        </tr>
        ${data.customerName ? `
        <tr>
          <td style="padding: 8px 0; color: #71717a; font-size: 14px;">${t.customer}</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 500;">${data.customerName}</td>
        </tr>
        ` : `
        <tr>
          <td style="padding: 8px 0; color: #71717a; font-size: 14px;">${t.customer}</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 500; color: #a1a1aa;">${t.walkIn}</td>
        </tr>
        `}
      </table>
    </div>
  `;

  return {
    subject: t.subject,
    html: getEmailWrapper(content, data),
  };
}

export const defaultTemplates = {
  password_reset: {
    subject: "Reset Your Password",
    description: "Sent when a user requests to reset their password",
    variables: ["{{userName}}", "{{resetUrl}}"],
  },
  order_confirmation: {
    subject: "Order Confirmation - #{{orderId}}",
    description: "Sent when an order is placed",
    variables: ["{{orderId}}", "{{orderTotal}}", "{{orderItems}}"],
  },
  payment_received: {
    subject: "Payment Received",
    description: "Sent when a payment is processed successfully",
    variables: ["{{amount}}", "{{paymentMethod}}", "{{transactionId}}"],
  },
  low_stock_alert: {
    subject: "Low Stock Alert: {{productName}}",
    description: "Sent when a product falls below minimum stock level",
    variables: ["{{productName}}", "{{currentStock}}", "{{minStock}}"],
  },
  transaction_receipt: {
    subject: "Receipt #{{receiptNumber}}",
    description: "Digital receipt sent to customers",
    variables: ["{{receiptNumber}}", "{{date}}", "{{total}}", "{{items}}"],
  },
  welcome_email: {
    subject: "Welcome to Flowp POS!",
    description: "Sent when a new business registers",
    variables: ["{{userName}}", "{{businessName}}", "{{loginUrl}}"],
  },
  new_sale_notification: {
    subject: "New Sale: {{orderNumber}}",
    description: "Sent to owner when a sale is completed",
    variables: ["{{orderNumber}}", "{{total}}", "{{itemCount}}", "{{paymentMethod}}", "{{customerName}}"],
  },
};
