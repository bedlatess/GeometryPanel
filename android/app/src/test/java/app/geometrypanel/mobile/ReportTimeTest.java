package app.geometrypanel.mobile;

import static org.junit.Assert.*;
import org.json.JSONObject;
import org.junit.Test;

public class ReportTimeTest {
    @Test public void numericEpochsAcceptFiniteIntegersWithoutRelaxingStringSyntax() throws Exception {
        long milliseconds = 1794016800000L, seconds = 1794016800L;
        for (Object value : new Object[] {milliseconds, (double)milliseconds,
                new JSONObject("{\"refreshTime\":1794016800000.0}").get("refreshTime"),
                new JSONObject().put("refreshTime",(double)milliseconds).get("refreshTime"),
                seconds, (double)seconds, new JSONObject("{\"refreshTime\":1794016800.0}").get("refreshTime")})
            assertEquals(milliseconds,ReportTime.parse(value));
        assertEquals(946684800000L,ReportTime.parse(946684800000.0));
        for (Object value : new Object[] {Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY,
                1794016800000.5,1794016800.25,-1794016800L,10000000000000L,Long.MAX_VALUE,
                946684799999L,999999999L,17940168000L,true,false,
                new JSONObject("{\"refreshTime\":1794016800000.00001}").get("refreshTime"),
                "1794016800000.0","1.7940168E12","NaN","Infinity",new Object()})
            assertEquals(0,ReportTime.parse(value));
        assertEquals(milliseconds,ReportTime.parse("1794016800000")); assertEquals(0,ReportTime.parse(null));
    }
}
